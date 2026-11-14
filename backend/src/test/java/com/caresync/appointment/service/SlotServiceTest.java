package com.caresync.appointment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.caresync.appointment.dto.SlotClosedReason;
import com.caresync.appointment.dto.SlotListResponse;
import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.entity.ScheduleEntry;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.doctor.repository.LeaveRepository;
import com.caresync.doctor.repository.ScheduleEntryRepository;
import com.caresync.reference.entity.Clinic;
import com.caresync.reference.repository.ClinicRepository;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

@ExtendWith(MockitoExtension.class)
class SlotServiceTest {

    // 2026-11-12T04:00:00Z = 2026-11-12 09:30 Asia/Kolkata (Thursday)
    private static final Instant FIXED_NOW = Instant.parse("2026-11-12T04:00:00Z");

    @Mock
    private DoctorRepository doctorRepository;

    @Mock
    private ClinicRepository clinicRepository;

    @Mock
    private ScheduleEntryRepository scheduleEntryRepository;

    @Mock
    private LeaveRepository leaveRepository;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private SlotService slotService;

    @BeforeEach
    void setUp() {
        slotService = new SlotService(
                doctorRepository,
                clinicRepository,
                scheduleEntryRepository,
                leaveRepository,
                jdbcTemplate,
                Clock.fixed(FIXED_NOW, ZoneOffset.UTC));
    }

    @Test
    void appliesClosedReasonsInPriorityOrderAndHidesInactiveDoctorFromPatients() {
        UUID doctorId = UUID.randomUUID();
        UUID clinicId = UUID.randomUUID();
        UserPrincipal staff = new UserPrincipal(UUID.randomUUID(), "rec@caresync.local", "Rec", Role.RECEPTIONIST, null, null);
        UserPrincipal patient = new UserPrincipal(UUID.randomUUID(), "pat@caresync.local", "Pat", Role.PATIENT, UUID.randomUUID(), null);
        Clinic clinic = new Clinic(clinicId, "Main", "Hyd", "Asia/Kolkata");
        Doctor inactive = new Doctor(
                doctorId,
                new User(UUID.randomUUID(), "dr@caresync.local", "hash", "Dr. Rao", Role.DOCTOR, FIXED_NOW),
                UUID.randomUUID(), clinicId, UUID.randomUUID(),
                null, new BigDecimal("500.00"), 30, false);

        when(doctorRepository.findById(doctorId)).thenReturn(Optional.of(inactive));
        when(clinicRepository.findById(clinicId)).thenReturn(Optional.of(clinic));

        assertThatThrownBy(() -> slotService.listDoctorSlots(patient, doctorId, LocalDate.of(2026, 11, 12)))
                .isInstanceOf(ResourceNotFoundException.class);

        SlotListResponse inactiveResp = slotService.listDoctorSlots(staff, doctorId, LocalDate.of(2026, 11, 10));
        assertThat(inactiveResp.closedReason()).isEqualTo(SlotClosedReason.DOCTOR_INACTIVE);
        assertThat(inactiveResp.slots()).isEmpty();

        Doctor active = new Doctor(
                doctorId, inactive.getUser(), inactive.getSpecializationId(), clinicId, inactive.getDepartmentId(),
                null, new BigDecimal("500.00"), 30, true);
        when(doctorRepository.findById(doctorId)).thenReturn(Optional.of(active));

        assertThat(slotService.listDoctorSlots(patient, doctorId, LocalDate.of(2026, 11, 11)).closedReason())
                .isEqualTo(SlotClosedReason.OUTSIDE_BOOKING_WINDOW);
        assertThat(slotService.listDoctorSlots(patient, doctorId, LocalDate.of(2026, 12, 13)).closedReason())
                .isEqualTo(SlotClosedReason.OUTSIDE_BOOKING_WINDOW);

        when(leaveRepository.existsOverlappingLeave(doctorId, LocalDate.of(2026, 11, 12), LocalDate.of(2026, 11, 12)))
                .thenReturn(true);
        assertThat(slotService.listDoctorSlots(patient, doctorId, LocalDate.of(2026, 11, 12)).closedReason())
                .isEqualTo(SlotClosedReason.ON_LEAVE);

        when(leaveRepository.existsOverlappingLeave(doctorId, LocalDate.of(2026, 11, 12), LocalDate.of(2026, 11, 12)))
                .thenReturn(false);
        when(scheduleEntryRepository.findByDoctorIdAndDayOfWeekOrderByStartTimeAsc(doctorId, DayOfWeek.THURSDAY))
                .thenReturn(List.of());
        assertThat(slotService.listDoctorSlots(patient, doctorId, LocalDate.of(2026, 11, 12)).closedReason())
                .isEqualTo(SlotClosedReason.NO_SCHEDULE);
    }

    @Test
    @SuppressWarnings("unchecked")
    void generatesUtcSlotsMarksPastAndBookedUnavailableAndAvoidsMidnightWraparound() {
        UUID doctorId = UUID.randomUUID();
        UUID clinicId = UUID.randomUUID();
        UserPrincipal patient = new UserPrincipal(UUID.randomUUID(), "pat@caresync.local", "Pat", Role.PATIENT, UUID.randomUUID(), null);
        Clinic clinic = new Clinic(clinicId, "Main", "Hyd", "Asia/Kolkata");
        Doctor doctor = new Doctor(
                doctorId,
                new User(UUID.randomUUID(), "dr@caresync.local", "hash", "Dr. Rao", Role.DOCTOR, FIXED_NOW),
                UUID.randomUUID(), clinicId, UUID.randomUUID(),
                null, new BigDecimal("500.00"), 30, true);

        LocalDate thursday = LocalDate.of(2026, 11, 12);
        when(doctorRepository.findById(doctorId)).thenReturn(Optional.of(doctor));
        when(clinicRepository.findById(clinicId)).thenReturn(Optional.of(clinic));
        when(leaveRepository.existsOverlappingLeave(doctorId, thursday, thursday)).thenReturn(false);
        // 09:00-10:30 (03:30Z, 04:00Z, 04:30Z) + late-night 23:20-23:55 (one 30m slot 23:20-23:50, no midnight wrap)
        when(scheduleEntryRepository.findByDoctorIdAndDayOfWeekOrderByStartTimeAsc(doctorId, DayOfWeek.THURSDAY))
                .thenReturn(List.of(
                        new ScheduleEntry(UUID.randomUUID(), doctorId, DayOfWeek.THURSDAY, LocalTime.of(9, 0), LocalTime.of(10, 30)),
                        new ScheduleEntry(UUID.randomUUID(), doctorId, DayOfWeek.THURSDAY, LocalTime.of(23, 20), LocalTime.of(23, 55))));

        Instant bookedSlotStart = Instant.parse("2026-11-12T04:30:00Z"); // 10:00 IST booked
        when(jdbcTemplate.query(anyString(), any(RowMapper.class), eq(doctorId), any(Timestamp.class), any(Timestamp.class)))
                .thenReturn(List.of(bookedSlotStart));

        SlotListResponse response = slotService.listDoctorSlots(patient, doctorId, thursday);
        assertThat(response.closedReason()).isNull();
        assertThat(response.timeZone()).isEqualTo("Asia/Kolkata");
        // 09:00 (past), 09:30 (equals now -> not in future -> false), 10:00 (booked -> false), 23:20 (future -> true)
        assertThat(response.slots()).hasSize(4);
        assertThat(response.slots().get(0).start()).isEqualTo(Instant.parse("2026-11-12T03:30:00Z"));
        assertThat(response.slots().get(0).available()).isFalse();
        assertThat(response.slots().get(1).start()).isEqualTo(Instant.parse("2026-11-12T04:00:00Z"));
        assertThat(response.slots().get(1).available()).isFalse();
        assertThat(response.slots().get(2).start()).isEqualTo(Instant.parse("2026-11-12T04:30:00Z"));
        assertThat(response.slots().get(2).available()).isFalse();
        assertThat(response.slots().get(3).start()).isEqualTo(Instant.parse("2026-11-12T17:50:00Z"));
        assertThat(response.slots().get(3).available()).isTrue();
    }
}
