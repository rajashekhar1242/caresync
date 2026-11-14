package com.caresync.prescription.service;

import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.service.AuditService;
import com.caresync.auth.entity.Role;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.consultation.entity.Consultation;
import com.caresync.consultation.repository.ConsultationRepository;
import com.caresync.medicine.entity.Medicine;
import com.caresync.medicine.entity.WarningSeverity;
import com.caresync.patient.repository.PatientRepository;
import com.caresync.prescription.dto.PrescriptionCreateRequest;
import com.caresync.prescription.dto.PrescriptionItemRequest;
import com.caresync.prescription.dto.PrescriptionResponse;
import com.caresync.prescription.dto.PrescriptionWarningDto;
import com.caresync.prescription.entity.Prescription;
import com.caresync.prescription.entity.PrescriptionItem;
import com.caresync.prescription.entity.PrescriptionWarning;
import com.caresync.prescription.repository.PrescriptionRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PrescriptionService {

    private final PrescriptionRepository prescriptionRepository;
    private final ConsultationRepository consultationRepository;
    private final PatientRepository patientRepository;
    private final SafetyCheckService safetyCheckService;
    private final PrescriptionPdfService prescriptionPdfService;
    private final AuditService auditService;
    private final Clock clock;

    public PrescriptionService(
            PrescriptionRepository prescriptionRepository,
            ConsultationRepository consultationRepository,
            PatientRepository patientRepository,
            SafetyCheckService safetyCheckService,
            PrescriptionPdfService prescriptionPdfService,
            AuditService auditService,
            Clock clock) {
        this.prescriptionRepository = prescriptionRepository;
        this.consultationRepository = consultationRepository;
        this.patientRepository = patientRepository;
        this.safetyCheckService = safetyCheckService;
        this.prescriptionPdfService = prescriptionPdfService;
        this.auditService = auditService;
        this.clock = clock;
    }

    @Transactional
    public PrescriptionResponse createPrescription(UserPrincipal caller, PrescriptionCreateRequest request) {
        Set<UUID> uniqueMedicineIds = new HashSet<>();
        for (PrescriptionItemRequest item : request.items()) {
            if (!uniqueMedicineIds.add(item.medicineId())) {
                throw new ValidationException("items", "Duplicate medicineId in items is not allowed");
            }
        }

        Consultation consultation = consultationRepository.findWithDetailsById(request.consultationId())
                .orElseThrow(() -> new ResourceNotFoundException("Consultation not found"));

        List<UUID> orderedIds = request.items().stream().map(PrescriptionItemRequest::medicineId).toList();
        Map<UUID, Medicine> medicinesById = safetyCheckService.loadMedicinesMap(orderedIds);

        if (caller.getRole() != Role.DOCTOR || !consultation.getDoctor().getId().equals(caller.getDoctorId())) {
            throw new ForbiddenException("Only the consultation's doctor may create a prescription");
        }

        if (consultation.isFinalized()) {
            throw new ConflictException(
                    ErrorCode.CONSULTATION_FINALIZED,
                    "Cannot create prescription for a finalized consultation");
        }
        if (prescriptionRepository.existsByConsultation_Id(consultation.getId())) {
            throw new ConflictException(
                    ErrorCode.PRESCRIPTION_ALREADY_EXISTS,
                    "Prescription already exists for this consultation");
        }

        List<Medicine> orderedMedicines = orderedIds.stream().map(medicinesById::get).toList();
        List<PrescriptionWarningDto> warnings = safetyCheckService.evaluateWarnings(
                consultation.getPatient().getAllergies(),
                orderedMedicines);

        boolean hasSevere = warnings.stream().anyMatch(w -> w.severity() == WarningSeverity.SEVERE);
        boolean acknowledged = Boolean.TRUE.equals(request.acknowledgeSevereWarnings());
        if (hasSevere && !acknowledged) {
            throw new ConflictException(
                    ErrorCode.SEVERE_WARNING_NOT_ACKNOWLEDGED,
                    "Prescription contains SEVERE safety warnings that must be acknowledged");
        }

        boolean severeAcknowledged = hasSevere && acknowledged;
        Instant now = Instant.now(clock);
        Prescription prescription = new Prescription(
                UUID.randomUUID(),
                consultation,
                consultation.getAppointment(),
                consultation.getPatient(),
                consultation.getDoctor(),
                severeAcknowledged,
                now);

        for (int i = 0; i < request.items().size(); i++) {
            PrescriptionItemRequest itemReq = request.items().get(i);
            prescription.addItem(new PrescriptionItem(
                    UUID.randomUUID(),
                    prescription,
                    medicinesById.get(itemReq.medicineId()),
                    itemReq.dosage().trim(),
                    itemReq.frequency().trim(),
                    itemReq.durationDays(),
                    normalizeOptional(itemReq.instructions()),
                    i));
        }

        for (int i = 0; i < warnings.size(); i++) {
            PrescriptionWarningDto warningDto = warnings.get(i);
            var medA = warningDto.medicines().getFirst();
            var medB = warningDto.medicines().size() > 1 ? warningDto.medicines().get(1) : null;
            prescription.addWarning(new PrescriptionWarning(
                    UUID.randomUUID(),
                    prescription,
                    warningDto.type(),
                    warningDto.severity(),
                    medA.id(),
                    medA.name(),
                    medB != null ? medB.id() : null,
                    medB != null ? medB.name() : null,
                    warningDto.message(),
                    i));
        }

        Prescription saved;
        try {
            saved = prescriptionRepository.saveAndFlush(prescription);
        } catch (DataIntegrityViolationException ex) {
            throw new ConflictException(
                    ErrorCode.PRESCRIPTION_ALREADY_EXISTS,
                    "Prescription already exists for this consultation");
        }

        auditService.recordCurrentUser(
                AuditAction.PRESCRIPTION_CREATED,
                saved.getId(),
                saved.getPatient().getId(),
                "Prescription created");
        return PrescriptionResponse.from(saved);
    }

    @Transactional
    public PrescriptionResponse getPrescription(UserPrincipal caller, UUID prescriptionId) {
        Prescription prescription = loadAuthorizedPrescription(caller, prescriptionId);
        auditService.recordCurrentUser(
                AuditAction.PRESCRIPTION_READ,
                prescription.getId(),
                prescription.getPatient().getId(),
                "Prescription read");
        return PrescriptionResponse.from(prescription);
    }

    @Transactional
    public byte[] getPrescriptionPdf(UserPrincipal caller, UUID prescriptionId) {
        Prescription prescription = loadAuthorizedPrescription(caller, prescriptionId);
        byte[] pdf = prescriptionPdfService.render(prescription);
        auditService.recordCurrentUser(
                AuditAction.PRESCRIPTION_PDF_DOWNLOADED,
                prescription.getId(),
                prescription.getPatient().getId(),
                "Prescription PDF downloaded");
        return pdf;
    }

    @Transactional
    public PageResponse<PrescriptionResponse> listPatientPrescriptions(
            UserPrincipal caller,
            UUID patientId,
            int page,
            int size) {
        if (!patientRepository.existsById(patientId)) {
            throw new ResourceNotFoundException("Patient not found");
        }
        enforcePatientListAccess(caller, patientId);

        Page<Prescription> prescriptions = prescriptionRepository.findByPatient_IdOrderByCreatedAtDescIdDesc(
                patientId,
                PageRequest.of(page, size));
        Page<PrescriptionResponse> mapped = prescriptions.map(PrescriptionResponse::from);

        auditService.recordCurrentUser(
                AuditAction.PRESCRIPTION_LIST_READ,
                patientId,
                patientId,
                "Patient prescriptions list read");
        return PageResponse.from(mapped);
    }

    private Prescription loadAuthorizedPrescription(UserPrincipal caller, UUID prescriptionId) {
        Prescription prescription = prescriptionRepository.findWithDetailsById(prescriptionId)
                .orElseThrow(() -> new ResourceNotFoundException("Prescription not found"));
        enforceSingleAccess(caller, prescription);
        return prescription;
    }

    private void enforceSingleAccess(UserPrincipal caller, Prescription prescription) {
        Role role = caller.getRole();
        UUID patientId = prescription.getPatient().getId();
        if (role == Role.ADMIN) {
            return;
        }
        if (role == Role.PATIENT) {
            if (patientId.equals(caller.getPatientId())) {
                return;
            }
            throw new ForbiddenException("Patients may only access their own prescriptions");
        }
        if (role == Role.DOCTOR) {
            UUID callerDoctorId = caller.getDoctorId();
            if (prescription.getDoctor().getId().equals(callerDoctorId)
                    || (callerDoctorId != null
                            && consultationRepository.existsByDoctor_IdAndPatient_Id(callerDoctorId, patientId))) {
                return;
            }
            throw new ForbiddenException("Doctor has not treated this patient");
        }
        throw new ForbiddenException("Access denied");
    }

    private void enforcePatientListAccess(UserPrincipal caller, UUID patientId) {
        Role role = caller.getRole();
        if (role == Role.ADMIN) {
            return;
        }
        if (role == Role.PATIENT) {
            if (patientId.equals(caller.getPatientId())) {
                return;
            }
            throw new ForbiddenException("Patients may only access their own prescriptions");
        }
        if (role == Role.DOCTOR) {
            UUID callerDoctorId = caller.getDoctorId();
            if (callerDoctorId != null
                    && consultationRepository.existsByDoctor_IdAndPatient_Id(callerDoctorId, patientId)) {
                return;
            }
            throw new ForbiddenException("Doctor has not treated this patient");
        }
        throw new ForbiddenException("Access denied");
    }

    private static String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
