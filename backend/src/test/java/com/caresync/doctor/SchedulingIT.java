package com.caresync.doctor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.config.RequestLoggingFilter;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.testsupport.BaseIntegrationTest;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class SchedulingIT extends BaseIntegrationTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JsonMapper jsonMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @Autowired
    private RequestLoggingFilter requestLoggingFilter;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(requestLoggingFilter, rateLimitFilter)
                .apply(springSecurity())
                .build();
        rateLimitFilter.clearBuckets();
    }

    @Test
    void fullScheduleLeaveAndSlotLifecycleWithPostgresTimezoneAndBookingChecks() throws Exception {
        String adminJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000001"),
                "admin-test@caresync.local", "Admin", Role.ADMIN, null, null));
        String patientJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "pat-sched@caresync.local", "Patient", Role.PATIENT, UUID.randomUUID(), null));

        UUID specId = jdbcTemplate.queryForObject("SELECT id FROM specializations LIMIT 1", UUID.class);
        UUID clinicId = jdbcTemplate.queryForObject(
                "SELECT id FROM clinics WHERE time_zone = 'Asia/Kolkata' LIMIT 1", UUID.class);
        String unique = UUID.randomUUID().toString().substring(0, 8);

        MvcResult deptRes = mockMvc.perform(post("/api/departments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"SchedDept %s"}
                                """.formatted(unique)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID deptId = UUID.fromString(jsonMapper.readTree(deptRes.getResponse().getContentAsString()).get("id").asString());

        MvcResult docRes = mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Dr. Sched %s","email":"sched-%s@caresync.local","password":"DocPassword!123","specializationId":"%s","clinicId":"%s","departmentId":"%s","consultationFee":"800.00","slotMinutes":30}
                                """.formatted(unique, unique, specId, clinicId, deptId)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode docJson = jsonMapper.readTree(docRes.getResponse().getContentAsString());
        UUID doctorId = UUID.fromString(docJson.get("id").asString());
        UUID docUserId = UUID.fromString(docJson.get("userId").asString());
        String ownDoctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                docUserId, "sched@caresync.local", "Dr. Sched", Role.DOCTOR, null, doctorId));
        String otherDoctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "other@caresync.local", "Dr. Other", Role.DOCTOR, null, UUID.randomUUID()));

        ZoneId zone = ZoneId.of("Asia/Kolkata");
        LocalDate targetDate = LocalDate.now(zone).plusDays(3);
        LocalDate secondDate = targetDate.plusDays(7);

        // Configure schedule for targetDate's weekday: 09:00-10:30 (3 slots of 30m)
        mockMvc.perform(put("/api/doctors/{id}/schedules", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ownDoctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"entries":[{"dayOfWeek":"%s","startTime":"09:00","endTime":"10:30"}]}
                                """.formatted(targetDate.getDayOfWeek().name())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entries.length()").value(1));

        // Another doctor cannot overwrite schedule
        mockMvc.perform(put("/api/doctors/{id}/schedules", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherDoctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"entries":[]}
                                """))
                .andExpect(status().isForbidden());

        // Check slots on targetDate -> 3 available slots
        MvcResult slotsBefore = mockMvc.perform(get("/api/doctors/{id}/slots", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .param("date", targetDate.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.closedReason").isEmpty())
                .andExpect(jsonPath("$.slots.length()").value(3))
                .andExpect(jsonPath("$.slots[0].available").value(true))
                .andReturn();
        assertThat(jsonMapper.readTree(slotsBefore.getResponse().getContentAsString())
                .get("timeZone").asString()).isEqualTo("Asia/Kolkata");

        // Add leave on targetDate -> slots return ON_LEAVE
        MvcResult leaveRes = mockMvc.perform(post("/api/doctors/{id}/leaves", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ownDoctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"startDate":"%s","endDate":"%s","reason":"Conference"}
                                """.formatted(targetDate, targetDate)))
                .andExpect(status().isCreated())
                .andReturn();
        String leaveId = jsonMapper.readTree(leaveRes.getResponse().getContentAsString()).get("id").asString();

        mockMvc.perform(get("/api/doctors/{id}/slots", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .param("date", targetDate.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.closedReason").value("ON_LEAVE"))
                .andExpect(jsonPath("$.slots").isEmpty());

        // Overlapping leave returns 409 LEAVE_OVERLAP
        mockMvc.perform(post("/api/doctors/{id}/leaves", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ownDoctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"startDate":"%s","endDate":"%s"}
                                """.formatted(targetDate, targetDate.plusDays(1))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LEAVE_OVERLAP"));

        // Delete leave -> slots reopen!
        mockMvc.perform(delete("/api/doctors/{id}/leaves/{leaveId}", doctorId, leaveId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ownDoctorJwt))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/doctors/{id}/slots", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .param("date", targetDate.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slots.length()").value(3));

        // Insert a BOOKED appointment on secondDate -> LEAVE_HAS_BOOKED_APPOINTMENTS & slot unavailable
        UUID patientRowId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO patients (id, full_name) VALUES (?, ?)", patientRowId, "Leave Conflict Patient");
        Instant bookedStart = ZonedDateTime.of(secondDate, LocalTime.of(9, 0), zone).toInstant();
        Instant bookedEnd = bookedStart.plusSeconds(1800);
        jdbcTemplate.update("""
                INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status)
                VALUES (?, ?, ?, ?, ?, ?, 'BOOKED')
                """, UUID.randomUUID(), doctorId, patientRowId, clinicId, Timestamp.from(bookedStart), Timestamp.from(bookedEnd));

        mockMvc.perform(post("/api/doctors/{id}/leaves", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + ownDoctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"startDate":"%s","endDate":"%s"}
                                """.formatted(secondDate, secondDate)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("LEAVE_HAS_BOOKED_APPOINTMENTS"));

        mockMvc.perform(get("/api/doctors/{id}/slots", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .param("date", secondDate.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.slots[0].available").value(false))
                .andExpect(jsonPath("$.slots[1].available").value(true));
    }
}
