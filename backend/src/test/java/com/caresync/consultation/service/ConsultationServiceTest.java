package com.caresync.consultation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.appointment.repository.AppointmentRepository;
import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.service.AuditService;
import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.consultation.dto.ConsultationRequest;
import com.caresync.consultation.dto.ConsultationResponse;
import com.caresync.consultation.dto.VitalsDto;
import com.caresync.consultation.entity.Consultation;
import com.caresync.consultation.repository.ConsultationRepository;
import com.caresync.doctor.entity.Doctor;
import com.caresync.patient.entity.Patient;
import com.caresync.reference.entity.Clinic;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ConsultationServiceTest {

    @Mock
    private ConsultationRepository consultationRepository;
    @Mock
    private AppointmentRepository appointmentRepository;
    @Mock
    private AuditService auditService;

    private final Clock clock = Clock.fixed(Instant.parse("2026-06-10T06:00:00Z"), ZoneOffset.UTC);

    @Test
    void createsConsultationAndLogsAuditWhenInConsultation() {
        ConsultationService service = new ConsultationService(
                consultationRepository, appointmentRepository, auditService, clock);
        Appointment appointment = buildAppointment(AppointmentStatus.IN_CONSULTATION);
        UUID doctorId = appointment.getDoctor().getId();
        UserPrincipal doctor = new UserPrincipal(UUID.randomUUID(), "doc@clinic.test", "Dr. Sharma", Role.DOCTOR, null, doctorId);

        when(appointmentRepository.findWithDetailsById(appointment.getId())).thenReturn(Optional.of(appointment));
        when(consultationRepository.existsByAppointment_Id(appointment.getId())).thenReturn(false);
        when(consultationRepository.saveAndFlush(any(Consultation.class))).thenAnswer(inv -> inv.getArgument(0));

        ConsultationResponse response = service.createConsultation(
                doctor,
                appointment.getId(),
                new ConsultationRequest(
                        new VitalsDto("120/80", 72, new BigDecimal("36.8"), new BigDecimal("68.5"), 98),
                        "Fever",
                        "Viral fever",
                        "Rest",
                        LocalDate.of(2026, 6, 15)));

        assertThat(response.diagnosis()).isEqualTo("Viral fever");
        assertThat(response.vitals().pulse()).isEqualTo(72);
        assertThat(response.finalized()).isFalse();
        verify(auditService).recordCurrentUser(
                AuditAction.CONSULTATION_CREATED,
                response.id(),
                appointment.getPatient().getId(),
                "Consultation created");
    }

    @Test
    void rejectsWrongStatusPastFollowUpAndFinalizedUpdate() {
        ConsultationService service = new ConsultationService(
                consultationRepository, appointmentRepository, auditService, clock);
        Appointment scheduled = buildAppointment(AppointmentStatus.BOOKED);
        UUID doctorId = scheduled.getDoctor().getId();
        UserPrincipal doctor = new UserPrincipal(UUID.randomUUID(), "doc@clinic.test", "Dr. Sharma", Role.DOCTOR, null, doctorId);

        when(appointmentRepository.findWithDetailsById(scheduled.getId())).thenReturn(Optional.of(scheduled));

        assertThatThrownBy(() -> service.createConsultation(
                doctor,
                scheduled.getId(),
                new ConsultationRequest(null, null, null, null, LocalDate.of(2026, 6, 1))))
                .isInstanceOf(ValidationException.class);

        assertThatThrownBy(() -> service.createConsultation(
                doctor,
                scheduled.getId(),
                new ConsultationRequest(null, "Cough", null, null, LocalDate.of(2026, 6, 12))))
                .isInstanceOf(ConflictException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.APPOINTMENT_NOT_IN_CONSULTATION);

        Consultation finalized = new Consultation(
                UUID.randomUUID(), scheduled, scheduled.getPatient(), scheduled.getDoctor(), Instant.now(clock), Instant.now(clock));
        finalized.finalizeAt(Instant.now(clock), Instant.now(clock));
        when(consultationRepository.findWithDetailsById(finalized.getId())).thenReturn(Optional.of(finalized));

        assertThatThrownBy(() -> service.updateConsultation(
                doctor,
                finalized.getId(),
                new ConsultationRequest(null, "Updated", "Diag", null, null)))
                .isInstanceOf(ConflictException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.CONSULTATION_FINALIZED);

        UserPrincipal receptionist = new UserPrincipal(UUID.randomUUID(), "rec@clinic.test", "Receptionist", Role.RECEPTIONIST, null, null);
        assertThatThrownBy(() -> service.getConsultation(receptionist, finalized.getId()))
                .isInstanceOf(ForbiddenException.class);
    }

    private Appointment buildAppointment(AppointmentStatus status) {
        Clinic clinic = new Clinic(UUID.randomUUID(), "Clinic A", "Addr", "Asia/Kolkata");
        User docUser = new User(UUID.randomUUID(), "Dr. Sharma", "doc@clinic.test", "hash", Role.DOCTOR, Instant.now(clock));
        Doctor doctor = new Doctor(UUID.randomUUID(), docUser, UUID.randomUUID(), clinic.getId(), UUID.randomUUID(), null, new BigDecimal("500.00"), 15, true);
        Patient patient = new Patient(UUID.randomUUID(), null, "Priya", null, null, null, null, null, List.of(), Instant.now(clock), Instant.now(clock));
        return new Appointment(
                UUID.randomUUID(), doctor, patient, clinic,
                Instant.parse("2026-06-10T05:00:00Z"),
                Instant.parse("2026-06-10T05:15:00Z"),
                status, null, Instant.now(clock), Instant.now(clock));
    }
}
