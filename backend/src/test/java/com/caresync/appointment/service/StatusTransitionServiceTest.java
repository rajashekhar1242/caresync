package com.caresync.appointment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.appointment.dto.AppointmentResponse;
import com.caresync.appointment.dto.AppointmentStatusUpdateRequest;
import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.appointment.event.QueueChangedDomainEvent;
import com.caresync.appointment.event.QueueEventType;
import com.caresync.appointment.repository.AppointmentRepository;
import com.caresync.appointment.repository.DoctorDayCounterRepository;
import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.security.UserPrincipal;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.OptimisticLockingFailureException;

class StatusTransitionServiceTest {

    // 2026-06-10 04:00:00Z = 09:30 IST
    private static final Instant NOW = Instant.parse("2026-06-10T04:00:00Z");

    private AppointmentRepository appointmentRepository;
    private DoctorDayCounterRepository doctorDayCounterRepository;
    private ConsultationLifecyclePort consultationLifecyclePort;
    private AppointmentBillingPort appointmentBillingPort;
    private ApplicationEventPublisher eventPublisher;
    private StatusTransitionService service;

    private UUID appointmentId;
    private UUID doctorId;
    private UUID patientId;
    private Doctor doctor;
    private Patient patient;
    private Clinic clinic;

    @BeforeEach
    void setUp() {
        appointmentRepository = mock(AppointmentRepository.class);
        doctorDayCounterRepository = mock(DoctorDayCounterRepository.class);
        consultationLifecyclePort = mock(ConsultationLifecyclePort.class);
        appointmentBillingPort = mock(AppointmentBillingPort.class);
        eventPublisher = mock(ApplicationEventPublisher.class);
        service = new StatusTransitionService(
                appointmentRepository,
                doctorDayCounterRepository,
                consultationLifecyclePort,
                appointmentBillingPort,
                eventPublisher,
                Clock.fixed(NOW, ZoneOffset.UTC));

        appointmentId = UUID.randomUUID();
        doctorId = UUID.randomUUID();
        patientId = UUID.randomUUID();
        User docUser = new User(UUID.randomUUID(), "doc@caresync.local", "hash", "Dr. Rao", Role.DOCTOR, NOW);
        doctor = new Doctor(
                doctorId, docUser, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                null, new BigDecimal("500.00"), 15, true);
        patient = new Patient(
                patientId, null, "Asha", null, null, null, null, null, List.of(), NOW, NOW);
        clinic = new Clinic(doctor.getClinicId(), "Main", "Addr", "Asia/Kolkata");

        when(appointmentRepository.saveAndFlush(any(Appointment.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void enforcesOwnershipBeforeTransitionRulesAndChecksAllTimeWindows() {
        Appointment tomorrowBooked = new Appointment(
                appointmentId, doctor, patient, clinic,
                Instant.parse("2026-06-11T04:00:00Z"),
                Instant.parse("2026-06-11T04:15:00Z"),
                AppointmentStatus.BOOKED, null, NOW, NOW);
        when(appointmentRepository.findWithDetailsById(appointmentId)).thenReturn(Optional.of(tomorrowBooked));

        UserPrincipal receptionist = new UserPrincipal(
                UUID.randomUUID(), "rec@caresync.local", "Rec", Role.RECEPTIONIST, null, null);
        UserPrincipal ownDoctor = new UserPrincipal(
                UUID.randomUUID(), "doc@caresync.local", "Dr", Role.DOCTOR, null, doctorId);
        UserPrincipal ownPatient = new UserPrincipal(
                UUID.randomUUID(), "pat@caresync.local", "Asha", Role.PATIENT, patientId, null);

        // Receptionist cannot PATCH -> IN_CONSULTATION (403)
        assertThatThrownBy(() -> service.updateStatus(
                receptionist, appointmentId, new AppointmentStatusUpdateRequest(AppointmentStatus.IN_CONSULTATION, null)))
                .isInstanceOf(ForbiddenException.class);

        // Receptionist cannot CHECKED_IN before slot clinic-local date
        assertThatThrownBy(() -> service.updateStatus(
                receptionist, appointmentId, new AppointmentStatusUpdateRequest(AppointmentStatus.CHECKED_IN, null)))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.TRANSITION_TOO_EARLY));

        // Receptionist cannot NO_SHOW before slotStart
        assertThatThrownBy(() -> service.updateStatus(
                receptionist, appointmentId, new AppointmentStatusUpdateRequest(AppointmentStatus.NO_SHOW, null)))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.TRANSITION_TOO_EARLY));

        // Own patient cannot cancel within 2 hours of slotStart
        Appointment soonBooked = new Appointment(
                appointmentId, doctor, patient, clinic,
                NOW.plusSeconds(3600), NOW.plusSeconds(4500),
                AppointmentStatus.BOOKED, null, NOW, NOW);
        when(appointmentRepository.findWithDetailsById(appointmentId)).thenReturn(Optional.of(soonBooked));
        assertThatThrownBy(() -> service.updateStatus(
                ownPatient, appointmentId, new AppointmentStatusUpdateRequest(AppointmentStatus.CANCELLED, "late")))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CANCELLATION_WINDOW_CLOSED));

        // Illegal transition (BOOKED -> COMPLETED)
        assertThatThrownBy(() -> service.updateStatus(
                ownDoctor, appointmentId, new AppointmentStatusUpdateRequest(AppointmentStatus.COMPLETED, null)))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.ILLEGAL_STATE_TRANSITION));
    }

    @Test
    void checkInInConsultationAndCompleteEmitEventsAndFinalize() {
        Appointment todayBooked = new Appointment(
                appointmentId, doctor, patient, clinic,
                NOW.plusSeconds(1800), NOW.plusSeconds(2700),
                AppointmentStatus.BOOKED, null, NOW, NOW);
        when(appointmentRepository.findWithDetailsById(appointmentId)).thenReturn(Optional.of(todayBooked));
        when(doctorDayCounterRepository.incrementAndGetNextToken(doctorId, LocalDate.of(2026, 6, 10)))
                .thenReturn(1);

        UserPrincipal receptionist = new UserPrincipal(
                UUID.randomUUID(), "rec@caresync.local", "Rec", Role.RECEPTIONIST, null, null);
        UserPrincipal ownDoctor = new UserPrincipal(
                UUID.randomUUID(), "doc@caresync.local", "Dr", Role.DOCTOR, null, doctorId);

        // CHECKED_IN
        AppointmentResponse checkedIn = service.updateStatus(
                receptionist, appointmentId, new AppointmentStatusUpdateRequest(AppointmentStatus.CHECKED_IN, "ignored"));
        assertThat(checkedIn.status()).isEqualTo(AppointmentStatus.CHECKED_IN);
        assertThat(checkedIn.tokenNumber()).isEqualTo(1);
        assertThat(checkedIn.cancellationReason()).isNull();

        // IN_CONSULTATION conflict if doctor already active
        when(appointmentRepository.existsByDoctor_IdAndStatusAndIdNot(
                doctorId, AppointmentStatus.IN_CONSULTATION, appointmentId)).thenReturn(true);
        assertThatThrownBy(() -> service.updateStatus(
                ownDoctor, appointmentId, new AppointmentStatusUpdateRequest(AppointmentStatus.IN_CONSULTATION, null)))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.CONSULTATION_IN_PROGRESS));

        when(appointmentRepository.existsByDoctor_IdAndStatusAndIdNot(
                doctorId, AppointmentStatus.IN_CONSULTATION, appointmentId)).thenReturn(false);
        AppointmentResponse inConsult = service.updateStatus(
                ownDoctor, appointmentId, new AppointmentStatusUpdateRequest(AppointmentStatus.IN_CONSULTATION, null));
        assertThat(inConsult.status()).isEqualTo(AppointmentStatus.IN_CONSULTATION);

        // COMPLETED
        AppointmentResponse completed = service.updateStatus(
                ownDoctor, appointmentId, new AppointmentStatusUpdateRequest(AppointmentStatus.COMPLETED, null));
        assertThat(completed.status()).isEqualTo(AppointmentStatus.COMPLETED);
        verify(consultationLifecyclePort).verifyReadyAndFinalize(eq(appointmentId), eq(NOW));
        verify(appointmentBillingPort).createConsultationInvoice(eq(todayBooked), eq(NOW));

        ArgumentCaptor<QueueChangedDomainEvent> events = ArgumentCaptor.forClass(QueueChangedDomainEvent.class);
        verify(eventPublisher, org.mockito.Mockito.times(3)).publishEvent(events.capture());
        assertThat(events.getAllValues())
                .extracting(QueueChangedDomainEvent::eventType)
                .containsExactly(
                        QueueEventType.TOKEN_ISSUED,
                        QueueEventType.PATIENT_CALLED,
                        QueueEventType.CONSULTATION_COMPLETED);
    }

    @Test
    void translatesOptimisticLockConflictDuringCheckInAndCancelToIllegalStateTransition() {
        Appointment todayBooked = new Appointment(
                appointmentId, doctor, patient, clinic,
                NOW.plusSeconds(10_800), NOW.plusSeconds(11_700),
                AppointmentStatus.BOOKED, null, NOW, NOW);
        when(appointmentRepository.findWithDetailsById(appointmentId)).thenReturn(Optional.of(todayBooked));
        when(doctorDayCounterRepository.incrementAndGetNextToken(doctorId, LocalDate.of(2026, 6, 10)))
                .thenReturn(1);
        when(appointmentRepository.saveAndFlush(any(Appointment.class)))
                .thenThrow(new OptimisticLockingFailureException("stale version"));

        UserPrincipal receptionist = new UserPrincipal(
                UUID.randomUUID(), "rec@caresync.local", "Rec", Role.RECEPTIONIST, null, null);

        assertThatThrownBy(() -> service.updateStatus(
                receptionist, appointmentId, new AppointmentStatusUpdateRequest(AppointmentStatus.CHECKED_IN, null)))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.ILLEGAL_STATE_TRANSITION));

        verify(eventPublisher, never()).publishEvent(any());
    }
}
