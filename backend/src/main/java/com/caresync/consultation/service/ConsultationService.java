package com.caresync.consultation.service;

import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.appointment.repository.AppointmentRepository;
import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.service.AuditService;
import com.caresync.auth.entity.Role;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.common.util.TimeZoneUtils;
import com.caresync.consultation.dto.ConsultationRequest;
import com.caresync.consultation.dto.ConsultationResponse;
import com.caresync.consultation.dto.VitalsDto;
import com.caresync.consultation.entity.Consultation;
import com.caresync.consultation.repository.ConsultationRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ConsultationService {

    private final ConsultationRepository consultationRepository;
    private final AppointmentRepository appointmentRepository;
    private final AuditService auditService;
    private final Clock clock;

    public ConsultationService(
            ConsultationRepository consultationRepository,
            AppointmentRepository appointmentRepository,
            AuditService auditService,
            Clock clock) {
        this.consultationRepository = consultationRepository;
        this.appointmentRepository = appointmentRepository;
        this.auditService = auditService;
        this.clock = clock;
    }

    @Transactional
    public ConsultationResponse getAppointmentConsultation(UserPrincipal caller, UUID appointmentId) {
        Appointment appointment = appointmentRepository.findWithDetailsById(appointmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Appointment not found"));
        enforceReadAccess(caller, appointment.getDoctor().getId(), appointment.getPatient().getId());

        Consultation consultation = consultationRepository.findWithDetailsByAppointmentId(appointmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Consultation not found"));

        auditService.recordCurrentUser(
                AuditAction.CONSULTATION_READ,
                consultation.getId(),
                consultation.getPatient().getId(),
                "Consultation read via appointment");
        return ConsultationResponse.from(consultation);
    }

    @Transactional
    public ConsultationResponse getConsultation(UserPrincipal caller, UUID consultationId) {
        Consultation consultation = consultationRepository.findWithDetailsById(consultationId)
                .orElseThrow(() -> new ResourceNotFoundException("Consultation not found"));
        enforceReadAccess(caller, consultation.getDoctor().getId(), consultation.getPatient().getId());

        auditService.recordCurrentUser(
                AuditAction.CONSULTATION_READ,
                consultation.getId(),
                consultation.getPatient().getId(),
                "Consultation read");
        return ConsultationResponse.from(consultation);
    }

    @Transactional
    public ConsultationResponse createConsultation(
            UserPrincipal caller,
            UUID appointmentId,
            ConsultationRequest request) {
        Appointment appointment = appointmentRepository.findWithDetailsById(appointmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Appointment not found"));

        validateFollowUpDate(request.followUpDate(), appointment.getClinic().getTimeZone());
        enforceTreatingDoctor(caller, appointment.getDoctor().getId());

        if (appointment.getStatus() != AppointmentStatus.IN_CONSULTATION) {
            throw new ConflictException(
                    ErrorCode.APPOINTMENT_NOT_IN_CONSULTATION,
                    "Consultation can only be created when appointment is IN_CONSULTATION");
        }
        if (consultationRepository.existsByAppointment_Id(appointmentId)) {
            throw new ConflictException(
                    ErrorCode.CONSULTATION_ALREADY_EXISTS,
                    "Consultation already exists for this appointment");
        }

        Instant now = Instant.now(clock);
        Consultation consultation = new Consultation(
                UUID.randomUUID(),
                appointment,
                appointment.getPatient(),
                appointment.getDoctor(),
                now,
                now);
        applyFields(consultation, request);

        Consultation saved;
        try {
            saved = consultationRepository.saveAndFlush(consultation);
        } catch (DataIntegrityViolationException ex) {
            throw new ConflictException(
                    ErrorCode.CONSULTATION_ALREADY_EXISTS,
                    "Consultation already exists for this appointment");
        }

        auditService.recordCurrentUser(
                AuditAction.CONSULTATION_CREATED,
                saved.getId(),
                saved.getPatient().getId(),
                "Consultation created");
        return ConsultationResponse.from(saved);
    }

    @Transactional
    public ConsultationResponse updateConsultation(
            UserPrincipal caller,
            UUID consultationId,
            ConsultationRequest request) {
        Consultation consultation = consultationRepository.findWithDetailsById(consultationId)
                .orElseThrow(() -> new ResourceNotFoundException("Consultation not found"));

        validateFollowUpDate(request.followUpDate(), consultation.getAppointment().getClinic().getTimeZone());
        enforceTreatingDoctor(caller, consultation.getDoctor().getId());

        if (consultation.isFinalized()) {
            throw new ConflictException(
                    ErrorCode.CONSULTATION_FINALIZED,
                    "Finalized consultation cannot be updated");
        }

        applyFields(consultation, request);
        consultation.setUpdatedAt(Instant.now(clock));

        Consultation saved = consultationRepository.saveAndFlush(consultation);
        auditService.recordCurrentUser(
                AuditAction.CONSULTATION_UPDATED,
                saved.getId(),
                saved.getPatient().getId(),
                "Consultation updated");
        return ConsultationResponse.from(saved);
    }

    private void enforceReadAccess(UserPrincipal caller, UUID doctorId, UUID patientId) {
        Role role = caller.getRole();
        if (role == Role.ADMIN) {
            return;
        }
        if (role == Role.PATIENT) {
            if (patientId.equals(caller.getPatientId())) {
                return;
            }
            throw new ForbiddenException("Patients may only access their own consultations");
        }
        if (role == Role.DOCTOR) {
            UUID callerDoctorId = caller.getDoctorId();
            if (doctorId.equals(callerDoctorId)
                    || (callerDoctorId != null
                            && consultationRepository.existsByDoctor_IdAndPatient_Id(callerDoctorId, patientId))) {
                return;
            }
            throw new ForbiddenException("Doctor has not treated this patient");
        }
        throw new ForbiddenException("Access denied");
    }

    private void enforceTreatingDoctor(UserPrincipal caller, UUID doctorId) {
        if (caller.getRole() != Role.DOCTOR || !doctorId.equals(caller.getDoctorId())) {
            throw new ForbiddenException("Only the appointment's doctor may modify this consultation");
        }
    }

    private void validateFollowUpDate(LocalDate followUpDate, String timeZoneId) {
        if (followUpDate == null) {
            return;
        }
        ZoneId clinicZone = TimeZoneUtils.resolveZone(timeZoneId);
        LocalDate clinicToday = TimeZoneUtils.todayInZone(clinicZone, clock);
        if (followUpDate.isBefore(clinicToday)) {
            throw new ValidationException("followUpDate", "followUpDate must not be before today in clinic time zone");
        }
    }

    private static void applyFields(Consultation consultation, ConsultationRequest request) {
        VitalsDto vitals = request.vitals();
        if (vitals == null) {
            consultation.setVitalsBloodPressure(null);
            consultation.setVitalsPulse(null);
            consultation.setVitalsTemperature(null);
            consultation.setVitalsWeightKg(null);
            consultation.setVitalsSpo2(null);
        } else {
            consultation.setVitalsBloodPressure(normalizeOptional(vitals.bloodPressure()));
            consultation.setVitalsPulse(vitals.pulse());
            consultation.setVitalsTemperature(vitals.temperature());
            consultation.setVitalsWeightKg(vitals.weightKg());
            consultation.setVitalsSpo2(vitals.spo2());
        }
        consultation.setSymptoms(normalizeOptional(request.symptoms()));
        consultation.setDiagnosis(normalizeOptional(request.diagnosis()));
        consultation.setNotes(normalizeOptional(request.notes()));
        consultation.setFollowUpDate(request.followUpDate());
    }

    private static String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
