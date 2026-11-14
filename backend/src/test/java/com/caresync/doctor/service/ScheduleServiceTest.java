package com.caresync.doctor.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.doctor.dto.ScheduleEntryDto;
import com.caresync.doctor.dto.WeeklyScheduleRequest;
import com.caresync.doctor.dto.WeeklyScheduleResponse;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.doctor.repository.ScheduleEntryRepository;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ScheduleServiceTest {

    @Mock
    private DoctorRepository doctorRepository;

    @Mock
    private ScheduleEntryRepository scheduleEntryRepository;

    private ScheduleService scheduleService;

    @BeforeEach
    void setUp() {
        scheduleService = new ScheduleService(doctorRepository, scheduleEntryRepository);
    }

    @Test
    void replaceScheduleValidatesRulesAllowsTouchingRangesAndSortsResult() {
        UUID doctorId = UUID.randomUUID();
        UserPrincipal doctorCaller = new UserPrincipal(
                UUID.randomUUID(), "dr@caresync.local", "Dr. Rao", Role.DOCTOR, null, doctorId);
        Doctor doctor = new Doctor(
                doctorId,
                new User(doctorCaller.getUserId(), "dr@caresync.local", "hash", "Dr. Rao", Role.DOCTOR, Instant.now()),
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                null, new BigDecimal("500.00"), 15, true);

        when(doctorRepository.findById(doctorId)).thenReturn(Optional.of(doctor));
        when(scheduleEntryRepository.saveAll(any())).thenAnswer(inv -> inv.getArgument(0));

        // Touching ranges 09:00-13:00 and 13:00-17:00 do NOT overlap
        WeeklyScheduleResponse response = scheduleService.replaceSchedule(
                doctorCaller,
                doctorId,
                new WeeklyScheduleRequest(List.of(
                        new ScheduleEntryDto(DayOfWeek.MONDAY, "13:00", "17:00"),
                        new ScheduleEntryDto(DayOfWeek.MONDAY, "09:00", "13:00"))));

        verify(scheduleEntryRepository).deleteAllByDoctorId(doctorId);
        assertThat(response.entries()).hasSize(2);
        assertThat(response.entries().get(0).startTime()).isEqualTo("09:00");
        assertThat(response.entries().get(1).startTime()).isEqualTo("13:00");

        // Overlapping ranges -> 400 INVALID_SCHEDULE
        assertThatThrownBy(() -> scheduleService.replaceSchedule(
                doctorCaller,
                doctorId,
                new WeeklyScheduleRequest(List.of(
                        new ScheduleEntryDto(DayOfWeek.TUESDAY, "09:00", "12:00"),
                        new ScheduleEntryDto(DayOfWeek.TUESDAY, "11:30", "14:00")))))
                .isInstanceOf(ValidationException.class)
                .satisfies(ex -> {
                    ValidationException ve = (ValidationException) ex;
                    assertThat(ve.getErrorCode()).isEqualTo(ErrorCode.INVALID_SCHEDULE);
                    assertThat(ve.getFieldErrors()).isNotEmpty();
                });

        // Shorter than slotMinutes (15m) -> 400 INVALID_SCHEDULE
        assertThatThrownBy(() -> scheduleService.replaceSchedule(
                doctorCaller,
                doctorId,
                new WeeklyScheduleRequest(List.of(
                        new ScheduleEntryDto(DayOfWeek.WEDNESDAY, "09:00", "09:10")))))
                .isInstanceOf(ValidationException.class)
                .satisfies(ex -> assertThat(((ValidationException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_SCHEDULE));

        // startTime >= endTime -> 400 INVALID_SCHEDULE
        assertThatThrownBy(() -> scheduleService.replaceSchedule(
                doctorCaller,
                doctorId,
                new WeeklyScheduleRequest(List.of(
                        new ScheduleEntryDto(DayOfWeek.THURSDAY, "14:00", "13:00")))))
                .isInstanceOf(ValidationException.class)
                .satisfies(ex -> assertThat(((ValidationException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.INVALID_SCHEDULE));
    }

    @Test
    void doctorCannotAccessOrModifyAnotherDoctorsSchedule() {
        UserPrincipal doctorCaller = new UserPrincipal(
                UUID.randomUUID(), "dr@caresync.local", "Dr. One", Role.DOCTOR, null, UUID.randomUUID());
        UUID otherDoctorId = UUID.randomUUID();

        assertThatThrownBy(() -> scheduleService.getSchedule(doctorCaller, otherDoctorId))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> scheduleService.replaceSchedule(
                doctorCaller, otherDoctorId, new WeeklyScheduleRequest(List.of())))
                .isInstanceOf(ForbiddenException.class);
    }
}
