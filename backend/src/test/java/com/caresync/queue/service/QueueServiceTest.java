package com.caresync.queue.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.appointment.entity.DoctorDayCounter;
import com.caresync.appointment.entity.DoctorDayCounterId;
import com.caresync.appointment.repository.AppointmentRepository;
import com.caresync.appointment.repository.DoctorDayCounterRepository;
import com.caresync.appointment.repository.QueueBoardTokenProjection;
import com.caresync.appointment.service.StatusTransitionService;
import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.doctor.repository.LeaveRepository;
import com.caresync.doctor.repository.ScheduleEntryRepository;
import com.caresync.patient.entity.Patient;
import com.caresync.queue.dto.QueueBoardResponse;
import com.caresync.queue.dto.QueueStateResponse;
import com.caresync.reference.entity.Clinic;
import com.caresync.reference.repository.ClinicRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class QueueServiceTest {

    // 2026-06-10 04:00:00Z = 09:30 IST (Wednesday)
    private static final Instant NOW = Instant.parse("2026-06-10T04:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 6, 10);

    private DoctorRepository doctorRepository;
    private ClinicRepository clinicRepository;
    private AppointmentRepository appointmentRepository;
    private DoctorDayCounterRepository doctorDayCounterRepository;
    private ScheduleEntryRepository scheduleEntryRepository;
    private LeaveRepository leaveRepository;
    private StatusTransitionService statusTransitionService;
    private QueueService queueService;

    private UUID doctorId;
    private UUID clinicId;
    private Doctor doctor;
    private Clinic clinic;

    @BeforeEach
    void setUp() {
        doctorRepository = mock(DoctorRepository.class);
        clinicRepository = mock(ClinicRepository.class);
        appointmentRepository = mock(AppointmentRepository.class);
        doctorDayCounterRepository = mock(DoctorDayCounterRepository.class);
        scheduleEntryRepository = mock(ScheduleEntryRepository.class);
        leaveRepository = mock(LeaveRepository.class);
        statusTransitionService = mock(StatusTransitionService.class);

        queueService = new QueueService(
                doctorRepository,
                clinicRepository,
                appointmentRepository,
                doctorDayCounterRepository,
                scheduleEntryRepository,
                leaveRepository,
                statusTransitionService,
                Clock.fixed(NOW, ZoneOffset.UTC));

        doctorId = UUID.randomUUID();
        clinicId = UUID.randomUUID();
        User docUser = new User(UUID.randomUUID(), "doc@caresync.local", "hash", "Dr. Rao", Role.DOCTOR, NOW);
        doctor = new Doctor(
                doctorId, docUser, UUID.randomUUID(), clinicId, UUID.randomUUID(),
                null, new BigDecimal("500.00"), 15, true);
        clinic = new Clinic(clinicId, "Main Clinic", "Addr", "Asia/Kolkata");

        when(doctorRepository.findWithUserById(doctorId)).thenReturn(Optional.of(doctor));
        when(clinicRepository.findById(clinicId)).thenReturn(Optional.of(clinic));
    }

    @Test
    void checks404Before403AndCallsLowestWaitingToken() {
        UUID missingDoctor = UUID.randomUUID();
        UserPrincipal patientCaller = new UserPrincipal(
                UUID.randomUUID(), "p@caresync.local", "Pat", Role.PATIENT, UUID.randomUUID(), null);
        when(doctorRepository.findWithUserById(missingDoctor)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> queueService.callNext(patientCaller, missingDoctor))
                .isInstanceOf(ResourceNotFoundException.class);

        UserPrincipal adminCaller = new UserPrincipal(
                UUID.randomUUID(), "a@caresync.local", "Admin", Role.ADMIN, null, null);
        assertThatThrownBy(() -> queueService.callNext(adminCaller, doctorId))
                .isInstanceOf(ForbiddenException.class);

        UserPrincipal receptionist = new UserPrincipal(
                UUID.randomUUID(), "r@caresync.local", "Rec", Role.RECEPTIONIST, null, null);

        when(appointmentRepository.findFirstByDoctor_IdAndStatus(doctorId, AppointmentStatus.IN_CONSULTATION))
                .thenReturn(Optional.empty());
        when(appointmentRepository.findTodayWaitingByDoctor(eq(doctorId), any(), any()))
                .thenReturn(List.of());
        assertThatThrownBy(() -> queueService.callNext(receptionist, doctorId))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.QUEUE_EMPTY));

        Patient pat1 = new Patient(UUID.randomUUID(), null, "Asha", null, null, null, null, null, List.of(), NOW, NOW);
        Patient pat2 = new Patient(UUID.randomUUID(), null, "Ravi", null, null, null, null, null, List.of(), NOW, NOW);
        Appointment appt1 = checkedInAppt(pat1, 1);
        Appointment appt2 = checkedInAppt(pat2, 2);

        when(appointmentRepository.findTodayWaitingByDoctor(eq(doctorId), any(), any()))
                .thenReturn(List.of(appt1, appt2));
        when(statusTransitionService.moveCheckedInToInConsultation(eq(appt1), any(), eq(NOW)))
                .thenAnswer(inv -> {
                    appt1.setStatus(AppointmentStatus.IN_CONSULTATION);
                    return appt1;
                });
        when(doctorDayCounterRepository.findById(new DoctorDayCounterId(doctorId, TODAY)))
                .thenReturn(Optional.of(new DoctorDayCounter(doctorId, TODAY, 2)));

        QueueStateResponse result = queueService.callNext(receptionist, doctorId);
        assertThat(result.nowServing().tokenNumber()).isEqualTo(1);
        assertThat(result.nowServing().patientName()).isEqualTo("Asha");
        assertThat(result.next()).hasSize(1);
        assertThat(result.next().getFirst().tokenNumber()).isEqualTo(2);
        assertThat(result.waitingCount()).isEqualTo(1);
        assertThat(result.lastTokenIssued()).isEqualTo(2);
    }

    @Test
    void queueBoardListsOpenDoctorsAndDoctorsWithTokensTodayWithoutPii() {
        UUID inactiveWithTokenId = UUID.randomUUID();
        User u2 = new User(UUID.randomUUID(), "d2@caresync.local", "hash", "Dr. Sen", Role.DOCTOR, NOW);
        Doctor inactiveWithToken = new Doctor(
                inactiveWithTokenId, u2, UUID.randomUUID(), clinicId, UUID.randomUUID(),
                null, new BigDecimal("500.00"), 15, false);

        when(doctorRepository.findByClinicIdOrderByUser_FullNameAscIdAsc(clinicId))
                .thenReturn(List.of(doctor, inactiveWithToken));
        when(doctorDayCounterRepository.findByDoctorIdInAndCounterDate(List.of(doctorId, inactiveWithTokenId), TODAY))
                .thenReturn(List.of(new DoctorDayCounter(inactiveWithTokenId, TODAY, 3)));
        when(leaveRepository.findDoctorIdsOnLeave(List.of(doctorId, inactiveWithTokenId), TODAY))
                .thenReturn(Set.of());
        when(scheduleEntryRepository.findDoctorIdsWithScheduleOnDay(
                        List.of(doctorId, inactiveWithTokenId), TODAY.getDayOfWeek()))
                .thenReturn(Set.of(doctorId));
        when(appointmentRepository.findBoardQueueTokens(eq(List.of(doctorId, inactiveWithTokenId)), any(), any()))
                .thenReturn(List.of(
                        new QueueBoardTokenProjection(inactiveWithTokenId, AppointmentStatus.IN_CONSULTATION, 2),
                        new QueueBoardTokenProjection(inactiveWithTokenId, AppointmentStatus.CHECKED_IN, 3)));

        QueueBoardResponse board = queueService.getQueueBoard(clinicId);
        assertThat(board.clinicName()).isEqualTo("Main Clinic");
        assertThat(board.doctors()).hasSize(2);
        assertThat(board.doctors()).extracting("doctorId")
                .containsExactlyInAnyOrder(doctorId, inactiveWithTokenId);
        assertThat(board.doctors().get(1).nowServing()).isEqualTo(2);
        assertThat(board.doctors().get(1).next()).containsExactly(3);
        assertThat(board.doctors().get(1).waitingCount()).isEqualTo(1);

        verify(leaveRepository, never()).existsOverlappingLeave(any(), any(), any());
        verify(scheduleEntryRepository, never()).findByDoctorIdAndDayOfWeekOrderByStartTimeAsc(any(), any());
        verify(appointmentRepository, never()).findFirstByDoctor_IdAndStatus(any(), any());
        verify(appointmentRepository, never()).findTodayWaitingByDoctor(any(), any(), any());
    }

    private Appointment checkedInAppt(Patient patient, int token) {
        Appointment appt = new Appointment(
                UUID.randomUUID(), doctor, patient, clinic,
                NOW.plusSeconds(600), NOW.plusSeconds(1500),
                AppointmentStatus.CHECKED_IN, null, NOW, NOW);
        appt.setTokenNumber(token);
        appt.setCheckedInAt(NOW.minusSeconds(120));
        return appt;
    }
}
