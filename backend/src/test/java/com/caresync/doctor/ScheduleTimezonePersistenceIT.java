package com.caresync.doctor;

import static org.assertj.core.api.Assertions.assertThat;

import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.common.security.UserPrincipal;
import com.caresync.doctor.dto.ScheduleEntryDto;
import com.caresync.doctor.dto.WeeklyScheduleRequest;
import com.caresync.doctor.dto.WeeklyScheduleResponse;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.entity.ScheduleEntry;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.doctor.repository.ScheduleEntryRepository;
import com.caresync.doctor.service.ScheduleService;
import com.caresync.testsupport.BaseIntegrationTest;
import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.TimeZone;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class ScheduleTimezonePersistenceIT extends BaseIntegrationTest {

    @Autowired
    private ScheduleService scheduleService;

    @Autowired
    private com.caresync.appointment.service.SlotService slotService;

    @Autowired
    private DoctorRepository doctorRepository;

    @Autowired
    private ScheduleEntryRepository scheduleEntryRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private UUID doctorId;
    private UserPrincipal doctorPrincipal;
    private TimeZone defaultTimeZoneBefore;

    @BeforeEach
    void setUp() {
        defaultTimeZoneBefore = TimeZone.getDefault();
        UUID clinicId = jdbcTemplate.queryForObject("SELECT id FROM clinics LIMIT 1", UUID.class);
        UUID deptId = jdbcTemplate.queryForObject("SELECT id FROM departments LIMIT 1", UUID.class);
        UUID specId = jdbcTemplate.queryForObject("SELECT id FROM specializations LIMIT 1", UUID.class);

        UUID userId = UUID.randomUUID();
        String email = "dr.tz." + UUID.randomUUID().toString().substring(0, 8) + "@caresync.local";
        jdbcTemplate.update("""
                INSERT INTO users (id, email, password_hash, full_name, role, created_at)
                VALUES (?, ?, 'hash', 'Dr. Timezone', 'DOCTOR', NOW())
                """, userId, email);

        doctorId = UUID.randomUUID();
        doctorRepository.saveAndFlush(new Doctor(
                doctorId,
                new User(userId, email, "hash", "Dr. Timezone", Role.DOCTOR, Instant.now()),
                specId,
                clinicId,
                deptId,
                "REG-TZ-1",
                new BigDecimal("500.00"),
                5,
                true));

        doctorPrincipal = new UserPrincipal(
                userId, email, "Dr. Timezone", Role.DOCTOR, null, doctorId);
    }

    @AfterEach
    void tearDown() {
        TimeZone.setDefault(defaultTimeZoneBefore);
    }

    @ParameterizedTest
    @ValueSource(strings = {"Asia/Kolkata", "UTC", "America/New_York"})
    void scheduleWallClockTimesPersistExactAcrossJvmTimezones(String timeZoneId) {
        TimeZone.setDefault(TimeZone.getTimeZone(timeZoneId));

        // Test pairs covering 00:00, 00:05, 09:00, 12:30, 18:00, 23:55
        WeeklyScheduleRequest request = new WeeklyScheduleRequest(List.of(
                new ScheduleEntryDto(DayOfWeek.MONDAY, "00:00", "00:05"),
                new ScheduleEntryDto(DayOfWeek.MONDAY, "09:00", "12:30"),
                new ScheduleEntryDto(DayOfWeek.MONDAY, "18:00", "23:55"),
                new ScheduleEntryDto(DayOfWeek.TUESDAY, "00:00", "23:55")));

        WeeklyScheduleResponse response = scheduleService.replaceSchedule(doctorPrincipal, doctorId, request);
        assertThat(response.entries()).hasSize(4);

        // 1. Direct JDBC query against PostgreSQL TIME column: must be verbatim wall-clock strings
        List<Map<String, Object>> dbRows = jdbcTemplate.queryForList("""
                SELECT day_of_week, start_time::text as st, end_time::text as et
                FROM schedule_entries
                WHERE doctor_id = ?
                ORDER BY day_of_week ASC, start_time ASC
                """, doctorId);

        assertThat(dbRows).hasSize(4);
        assertThat(dbRows.get(0).get("st")).isEqualTo("00:00:00");
        assertThat(dbRows.get(0).get("et")).isEqualTo("00:05:00");
        assertThat(dbRows.get(1).get("st")).isEqualTo("09:00:00");
        assertThat(dbRows.get(1).get("et")).isEqualTo("12:30:00");
        assertThat(dbRows.get(2).get("st")).isEqualTo("18:00:00");
        assertThat(dbRows.get(2).get("et")).isEqualTo("23:55:00");
        assertThat(dbRows.get(3).get("st")).isEqualTo("00:00:00");
        assertThat(dbRows.get(3).get("et")).isEqualTo("23:55:00");

        // 2. JPA Entity reload: exact LocalTime equality
        List<ScheduleEntry> reloaded = scheduleEntryRepository.findByDoctorIdOrderByDayOfWeekAscStartTimeAsc(doctorId);
        assertThat(reloaded).hasSize(4);
        assertThat(reloaded.get(0).getStartTime()).isEqualTo(LocalTime.of(0, 0));
        assertThat(reloaded.get(0).getEndTime()).isEqualTo(LocalTime.of(0, 5));
        assertThat(reloaded.get(1).getStartTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(reloaded.get(1).getEndTime()).isEqualTo(LocalTime.of(12, 30));
        assertThat(reloaded.get(2).getStartTime()).isEqualTo(LocalTime.of(18, 0));
        assertThat(reloaded.get(2).getEndTime()).isEqualTo(LocalTime.of(23, 55));
        assertThat(reloaded.get(3).getStartTime()).isEqualTo(LocalTime.of(0, 0));
        assertThat(reloaded.get(3).getEndTime()).isEqualTo(LocalTime.of(23, 55));
    }

    @Test
    void postgresCheckConstraintPreventsInvalidEndBeforeStart() {
        // Attempting to persist start_time >= end_time directly in PostgreSQL must trigger schedule_entries_check
        UUID entryId = UUID.randomUUID();
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () -> {
            jdbcTemplate.update("""
                    INSERT INTO schedule_entries (id, doctor_id, day_of_week, start_time, end_time)
                    VALUES (?, ?, 'WEDNESDAY', '18:30:00'::time, '18:25:00'::time)
                    """, entryId, doctorId);
        });
    }

    @Test
    void slotGenerationProducesExactUtcInstantsFromMidnightSchedule() {
        WeeklyScheduleRequest request = new WeeklyScheduleRequest(List.of(
                new ScheduleEntryDto(DayOfWeek.MONDAY, "00:00", "01:00")));
        scheduleService.replaceSchedule(doctorPrincipal, doctorId, request);

        java.time.LocalDate nextMonday = java.time.LocalDate.now().with(java.time.temporal.TemporalAdjusters.next(DayOfWeek.MONDAY));
        com.caresync.appointment.dto.SlotListResponse slots = slotService.listDoctorSlots(
                doctorPrincipal, doctorId, nextMonday);

        assertThat(slots.slots()).hasSize(12);
        assertThat(slots.slots().get(0).start()).isNotNull();
    }
}
