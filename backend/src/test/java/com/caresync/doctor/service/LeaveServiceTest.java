package com.caresync.doctor.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.doctor.dto.LeaveRequest;
import com.caresync.doctor.dto.LeaveResponse;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.entity.Leave;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.doctor.repository.LeaveRepository;
import com.caresync.reference.entity.Clinic;
import com.caresync.reference.repository.ClinicRepository;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class LeaveServiceTest {

    // 2026-11-12T10:00:00Z = 2026-11-12 15:30 Asia/Kolkata
    private static final Instant FIXED_NOW = Instant.parse("2026-11-12T10:00:00Z");

    @Mock
    private DoctorRepository doctorRepository;

    @Mock
    private ClinicRepository clinicRepository;

    @Mock
    private LeaveRepository leaveRepository;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private LeaveService leaveService;

    @BeforeEach
    void setUp() {
        leaveService = new LeaveService(
                doctorRepository,
                clinicRepository,
                leaveRepository,
                jdbcTemplate,
                Clock.fixed(FIXED_NOW, ZoneOffset.UTC));
    }

    @Test
    void createLeaveValidatesClinicDatesOverlapsAndAppointments() {
        UUID doctorId = UUID.randomUUID();
        UUID clinicId = UUID.randomUUID();
        UserPrincipal admin = new UserPrincipal(
                UUID.randomUUID(), "admin@caresync.local", "Admin", Role.ADMIN, null, null);
        Doctor doctor = new Doctor(
                doctorId,
                new User(UUID.randomUUID(), "dr@caresync.local", "hash", "Dr. Rao", Role.DOCTOR, FIXED_NOW),
                UUID.randomUUID(), clinicId, UUID.randomUUID(),
                null, new BigDecimal("500.00"), 15, true);
        Clinic clinic = new Clinic(clinicId, "Main", "Hyd", "Asia/Kolkata");

        when(doctorRepository.findById(doctorId)).thenReturn(Optional.of(doctor));
        when(clinicRepository.findById(clinicId)).thenReturn(Optional.of(clinic));

        // Past startDate -> 400
        assertThatThrownBy(() -> leaveService.createLeave(
                admin, doctorId, new LeaveRequest(LocalDate.of(2026, 11, 11), LocalDate.of(2026, 11, 12), null)))
                .isInstanceOf(ValidationException.class);

        // endDate before startDate -> 400
        assertThatThrownBy(() -> leaveService.createLeave(
                admin, doctorId, new LeaveRequest(LocalDate.of(2026, 11, 15), LocalDate.of(2026, 11, 14), null)))
                .isInstanceOf(ValidationException.class);

        // Overlapping leave -> 409 LEAVE_OVERLAP
        when(leaveRepository.existsOverlappingLeave(doctorId, LocalDate.of(2026, 11, 15), LocalDate.of(2026, 11, 16)))
                .thenReturn(true);
        assertThatThrownBy(() -> leaveService.createLeave(
                admin, doctorId, new LeaveRequest(LocalDate.of(2026, 11, 15), LocalDate.of(2026, 11, 16), "Trip")))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.LEAVE_OVERLAP));

        // Active booked appointment -> 409 LEAVE_HAS_BOOKED_APPOINTMENTS
        when(leaveRepository.existsOverlappingLeave(doctorId, LocalDate.of(2026, 11, 20), LocalDate.of(2026, 11, 21)))
                .thenReturn(false);
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), eq(doctorId), any(Timestamp.class), any(Timestamp.class)))
                .thenReturn(1);
        assertThatThrownBy(() -> leaveService.createLeave(
                admin, doctorId, new LeaveRequest(LocalDate.of(2026, 11, 20), LocalDate.of(2026, 11, 21), "Conf")))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.LEAVE_HAS_BOOKED_APPOINTMENTS));

        // Happy path
        when(jdbcTemplate.queryForObject(anyString(), eq(Integer.class), eq(doctorId), any(Timestamp.class), any(Timestamp.class)))
                .thenReturn(0);
        when(leaveRepository.saveAndFlush(any(Leave.class))).thenAnswer(inv -> inv.getArgument(0));

        LeaveResponse created = leaveService.createLeave(
                admin, doctorId, new LeaveRequest(LocalDate.of(2026, 11, 20), LocalDate.of(2026, 11, 21), "  Conf  "));
        assertThat(created.reason()).isEqualTo("Conf");
        verify(leaveRepository).saveAndFlush(any(Leave.class));
    }

    @Test
    void doctorCannotDeleteAnotherDoctorsLeave() {
        UserPrincipal doctorCaller = new UserPrincipal(
                UUID.randomUUID(), "dr@caresync.local", "Dr. One", Role.DOCTOR, null, UUID.randomUUID());

        assertThatThrownBy(() -> leaveService.deleteLeave(doctorCaller, UUID.randomUUID(), UUID.randomUUID()))
                .isInstanceOf(ForbiddenException.class);
    }
}
