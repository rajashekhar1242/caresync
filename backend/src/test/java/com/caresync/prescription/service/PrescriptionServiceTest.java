package com.caresync.prescription.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.service.AuditService;
import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.security.UserPrincipal;
import com.caresync.consultation.entity.Consultation;
import com.caresync.consultation.repository.ConsultationRepository;
import com.caresync.doctor.entity.Doctor;
import com.caresync.medicine.entity.Medicine;
import com.caresync.medicine.entity.MedicineForm;
import com.caresync.medicine.entity.WarningSeverity;
import com.caresync.patient.entity.Patient;
import com.caresync.patient.repository.PatientRepository;
import com.caresync.prescription.dto.MedicineRef;
import com.caresync.prescription.dto.PrescriptionCreateRequest;
import com.caresync.prescription.dto.PrescriptionItemRequest;
import com.caresync.prescription.dto.PrescriptionResponse;
import com.caresync.prescription.dto.PrescriptionWarningDto;
import com.caresync.prescription.entity.Prescription;
import com.caresync.prescription.entity.WarningType;
import com.caresync.prescription.repository.PrescriptionRepository;
import com.caresync.reference.entity.Clinic;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PrescriptionServiceTest {

    @Mock
    private PrescriptionRepository prescriptionRepository;
    @Mock
    private ConsultationRepository consultationRepository;
    @Mock
    private PatientRepository patientRepository;
    @Mock
    private SafetyCheckService safetyCheckService;
    @Mock
    private PrescriptionPdfService prescriptionPdfService;
    @Mock
    private AuditService auditService;

    private final Clock clock = Clock.fixed(Instant.parse("2026-06-10T06:00:00Z"), ZoneOffset.UTC);

    @Test
    void blocksSevereWarningUnlessAcknowledgedAndSetsFlagOnlyWhenSevereExists() {
        PrescriptionService service = new PrescriptionService(
                prescriptionRepository,
                consultationRepository,
                patientRepository,
                safetyCheckService,
                prescriptionPdfService,
                auditService,
                clock);

        Consultation consultation = buildConsultation();
        UUID medId = UUID.randomUUID();
        Medicine medicine = new Medicine(medId, "Augmentin 625", "Amoxicillin + Clavulanic acid", "625 mg", MedicineForm.TABLET, "Penicillin");
        UserPrincipal doctor = new UserPrincipal(UUID.randomUUID(), "doc@clinic.test", "Dr. Sharma", Role.DOCTOR, null, consultation.getDoctor().getId());

        when(consultationRepository.findWithDetailsById(consultation.getId())).thenReturn(Optional.of(consultation));
        when(safetyCheckService.loadMedicinesMap(List.of(medId))).thenReturn(Map.of(medId, medicine));
        when(prescriptionRepository.existsByConsultation_Id(consultation.getId())).thenReturn(false);

        PrescriptionWarningDto severeWarning = new PrescriptionWarningDto(
                WarningType.ALLERGY,
                WarningSeverity.SEVERE,
                List.of(new MedicineRef(medId, medicine.getName())),
                "Allergic to Penicillin");
        when(safetyCheckService.evaluateWarnings(anyList(), anyList())).thenReturn(List.of(severeWarning));

        PrescriptionItemRequest itemReq = new PrescriptionItemRequest(medId, "625 mg", "1-0-1", 5, "After food");

        assertThatThrownBy(() -> service.createPrescription(
                doctor,
                new PrescriptionCreateRequest(consultation.getId(), List.of(itemReq), false)))
                .isInstanceOf(ConflictException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.SEVERE_WARNING_NOT_ACKNOWLEDGED);

        when(prescriptionRepository.saveAndFlush(any(Prescription.class))).thenAnswer(inv -> inv.getArgument(0));
        PrescriptionResponse acknowledged = service.createPrescription(
                doctor,
                new PrescriptionCreateRequest(consultation.getId(), List.of(itemReq), true));

        assertThat(acknowledged.severeWarningsAcknowledged()).isTrue();
        assertThat(acknowledged.warnings()).hasSize(1);
        verify(auditService).recordCurrentUser(
                AuditAction.PRESCRIPTION_CREATED,
                acknowledged.id(),
                consultation.getPatient().getId(),
                "Prescription created");

        // When no severe warning exists, even acknowledgeSevereWarnings=true produces severeWarningsAcknowledged=false
        when(safetyCheckService.evaluateWarnings(anyList(), anyList())).thenReturn(List.of());
        PrescriptionResponse noSevere = service.createPrescription(
                doctor,
                new PrescriptionCreateRequest(consultation.getId(), List.of(itemReq), true));
        assertThat(noSevere.severeWarningsAcknowledged()).isFalse();
    }

    private Consultation buildConsultation() {
        Clinic clinic = new Clinic(UUID.randomUUID(), "Clinic A", "Addr", "Asia/Kolkata");
        User docUser = new User(UUID.randomUUID(), "Dr. Sharma", "doc@clinic.test", "hash", Role.DOCTOR, Instant.now(clock));
        Doctor doctor = new Doctor(UUID.randomUUID(), docUser, UUID.randomUUID(), clinic.getId(), UUID.randomUUID(), null, new BigDecimal("500.00"), 15, true);
        Patient patient = new Patient(UUID.randomUUID(), null, "Priya", null, null, null, null, null, List.of("Penicillin"), Instant.now(clock), Instant.now(clock));
        Appointment appointment = new Appointment(
                UUID.randomUUID(), doctor, patient, clinic,
                Instant.parse("2026-06-10T05:00:00Z"),
                Instant.parse("2026-06-10T05:15:00Z"),
                AppointmentStatus.IN_CONSULTATION, null, Instant.now(clock), Instant.now(clock));
        return new Consultation(UUID.randomUUID(), appointment, patient, doctor, Instant.now(clock), Instant.now(clock));
    }
}
