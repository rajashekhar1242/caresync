package com.caresync.appointment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
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

class AppointmentIT extends BaseIntegrationTest {

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
    void concurrentDoubleBookingCancelRebookAndStateMachineLifecycle() throws Exception {
        String adminJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000001"),
                "admin-test@caresync.local", "Admin", Role.ADMIN, null, null));
        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000002"),
                "receptionist-test@caresync.local", "Receptionist", Role.RECEPTIONIST, null, null));

        String unique = UUID.randomUUID().toString().substring(0, 8);
        UUID specId = jdbcTemplate.queryForObject("SELECT id FROM specializations ORDER BY name LIMIT 1", UUID.class);
        UUID clinicId = jdbcTemplate.queryForObject("SELECT id FROM clinics ORDER BY name LIMIT 1", UUID.class);
        String clinicTz = jdbcTemplate.queryForObject(
                "SELECT time_zone FROM clinics WHERE id = ?", String.class, clinicId);
        ZoneId zone = ZoneId.of(clinicTz);

        MvcResult deptRes = mockMvc.perform(post("/api/departments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"ApptDept-%s"}
                                """.formatted(unique)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID deptId = UUID.fromString(jsonMapper.readTree(deptRes.getResponse().getContentAsString()).get("id").asString());

        MvcResult docRes = mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Dr. Appt %s",
                                  "email": "doc.appt.%s@caresync.local",
                                  "password": "Password!123",
                                  "specializationId": "%s",
                                  "clinicId": "%s",
                                  "departmentId": "%s",
                                  "consultationFee": "600.00",
                                  "slotMinutes": 15
                                }
                                """.formatted(unique, unique, specId, clinicId, deptId)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode docJson = jsonMapper.readTree(docRes.getResponse().getContentAsString());
        UUID doctorId = UUID.fromString(docJson.get("id").asString());
        UUID doctorUserId = UUID.fromString(docJson.get("userId").asString());
        String doctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                doctorUserId, "doc.appt." + unique + "@caresync.local",
                "Dr. Appt " + unique, Role.DOCTOR, null, doctorId));

        // Tomorrow clinic-local schedule + slots
        LocalDate clinicToday = LocalDate.now(zone);
        LocalDate tomorrow = clinicToday.plusDays(1);
        mockMvc.perform(put("/api/doctors/{doctorId}/schedules", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "entries": [
                                    {"dayOfWeek": "%s", "startTime": "09:00", "endTime": "12:00"},
                                    {"dayOfWeek": "%s", "startTime": "09:00", "endTime": "12:00"}
                                  ]
                                }
                                """.formatted(clinicToday.getDayOfWeek(), tomorrow.getDayOfWeek())))
                .andExpect(status().isOk());

        // Self-register two patients
        MvcResult reg1 = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Pat One %s","email":"p1.%s@caresync.local","password":"Password!123"}
                                """.formatted(unique, unique)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode p1Json = jsonMapper.readTree(reg1.getResponse().getContentAsString());
        String p1Jwt = p1Json.get("accessToken").asString();
        UUID patient1Id = UUID.fromString(p1Json.get("user").get("patientId").asString());

        MvcResult reg2 = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Pat Two %s","email":"p2.%s@caresync.local","password":"Password!123"}
                                """.formatted(unique, unique)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode p2Json = jsonMapper.readTree(reg2.getResponse().getContentAsString());
        String p2Jwt = p2Json.get("accessToken").asString();
        UUID patient2Id = UUID.fromString(p2Json.get("user").get("patientId").asString());

        Instant slotTomorrow = tomorrow.atTime(LocalTime.of(9, 0)).atZone(zone).toInstant();

        // 1. Concurrent double booking race -> exactly one 201 and one 409 SLOT_ALREADY_BOOKED
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch startGate = new CountDownLatch(1);
        List<Integer> statuses = Collections.synchronizedList(new ArrayList<>());
        try {
            Future<?> f1 = pool.submit(() -> {
                startGate.await();
                int sc = mockMvc.perform(post("/api/appointments")
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + p1Jwt)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"doctorId":"%s","patientId":"%s","slotStart":"%s","reason":"Visit 1"}
                                        """.formatted(doctorId, patient1Id, slotTomorrow)))
                        .andReturn().getResponse().getStatus();
                statuses.add(sc);
                return null;
            });
            Future<?> f2 = pool.submit(() -> {
                startGate.await();
                int sc = mockMvc.perform(post("/api/appointments")
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + p2Jwt)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"doctorId":"%s","patientId":"%s","slotStart":"%s","reason":"Visit 2"}
                                        """.formatted(doctorId, patient2Id, slotTomorrow)))
                        .andReturn().getResponse().getStatus();
                statuses.add(sc);
                return null;
            });
            startGate.countDown();
            f1.get();
            f2.get();
        } finally {
            pool.shutdownNow();
        }
        assertThat(statuses).containsExactlyInAnyOrder(201, 409);

        // Identify winning appointment and cancel it (>2h ahead), then rebook same slot
        UUID wonApptId = jdbcTemplate.queryForObject(
                "SELECT id FROM appointments WHERE doctor_id = ? AND slot_start = ? AND status = 'BOOKED'",
                UUID.class,
                doctorId,
                Timestamp.from(slotTomorrow));
        mockMvc.perform(patch("/api/appointments/{id}/status", wonApptId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"CANCELLED","reason":"Rescheduling"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancellationReason").value("Rescheduling"));

        // Rebook freed slot
        mockMvc.perform(post("/api/appointments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + p2Jwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"doctorId":"%s","patientId":"%s","slotStart":"%s","reason":"Rebooked"}
                                """.formatted(doctorId, patient2Id, slotTomorrow)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("BOOKED"));

        // 2. Same-day CHECKED_IN -> IN_CONSULTATION -> COMPLETED lifecycle (clock-independent via clinicToday BOOKED rows)
        Instant todaySlot1 = clinicToday.atTime(LocalTime.of(9, 0)).atZone(zone).toInstant();
        Instant todaySlot2 = clinicToday.atTime(LocalTime.of(9, 15)).atZone(zone).toInstant();
        UUID appt1 = UUID.randomUUID();
        UUID appt2 = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status) VALUES (?, ?, ?, ?, ?, ?, 'BOOKED')",
                appt1, doctorId, patient1Id, clinicId, Timestamp.from(todaySlot1), Timestamp.from(todaySlot1.plusSeconds(900)));
        jdbcTemplate.update(
                "INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status) VALUES (?, ?, ?, ?, ?, ?, 'BOOKED')",
                appt2, doctorId, patient2Id, clinicId, Timestamp.from(todaySlot2), Timestamp.from(todaySlot2.plusSeconds(900)));

        mockMvc.perform(patch("/api/appointments/{id}/status", appt1)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"CHECKED_IN"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CHECKED_IN"))
                .andExpect(jsonPath("$.tokenNumber").value(1));

        mockMvc.perform(patch("/api/appointments/{id}/status", appt2)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"CHECKED_IN"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tokenNumber").value(2));

        // Move appt1 to IN_CONSULTATION; appt2 blocked by CONSULTATION_IN_PROGRESS
        mockMvc.perform(patch("/api/appointments/{id}/status", appt1)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"IN_CONSULTATION"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_CONSULTATION"));

        mockMvc.perform(patch("/api/appointments/{id}/status", appt2)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"IN_CONSULTATION"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONSULTATION_IN_PROGRESS"));

        // Completing appt1 without consultation -> 409 CONSULTATION_INCOMPLETE
        mockMvc.perform(patch("/api/appointments/{id}/status", appt1)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"COMPLETED"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONSULTATION_INCOMPLETE"));

        // Insert consultation with diagnosis and complete -> finalized_at + CONSULTATION_FINALIZED audit
        UUID consultId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO consultations (id, appointment_id, patient_id, doctor_id, diagnosis) VALUES (?, ?, ?, ?, 'Viral fever')",
                consultId, appt1, patient1Id, doctorId);

        mockMvc.perform(patch("/api/appointments/{id}/status", appt1)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"COMPLETED"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        Integer finalizedCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM consultations WHERE id = ? AND finalized_at IS NOT NULL",
                Integer.class, consultId);
        assertThat(finalizedCount).isEqualTo(1);

        Integer auditCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM audit_logs WHERE action = 'CONSULTATION_FINALIZED' AND entity_id = ?",
                Integer.class, consultId);
        assertThat(auditCount).isEqualTo(1);

        // List scoping check: DOCTOR cannot query another doctorId
        mockMvc.perform(get("/api/appointments")
                        .param("doctorId", UUID.randomUUID().toString())
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt))
                .andExpect(status().isForbidden());

        // 3. Concurrent CHECKED_IN race on a fresh BOOKED appointment -> 1 wins (200), 1 gets 409 ILLEGAL_STATE_TRANSITION, single token only
        Instant todaySlot3 = clinicToday.atTime(LocalTime.of(9, 30)).atZone(zone).toInstant();
        UUID raceApptId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status) VALUES (?, ?, ?, ?, ?, ?, 'BOOKED')",
                raceApptId, doctorId, patient1Id, clinicId, Timestamp.from(todaySlot3), Timestamp.from(todaySlot3.plusSeconds(900)));

        List<Integer> checkInStatuses = Collections.synchronizedList(new ArrayList<>());
        List<String> checkInBodies = Collections.synchronizedList(new ArrayList<>());
        ExecutorService checkInPool = Executors.newFixedThreadPool(2);
        CountDownLatch checkInGate = new CountDownLatch(1);
        try {
            Future<?> c1 = checkInPool.submit(() -> {
                checkInGate.await();
                MvcResult res = mockMvc.perform(patch("/api/appointments/{id}/status", raceApptId)
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"status":"CHECKED_IN"}
                                        """))
                        .andReturn();
                checkInStatuses.add(res.getResponse().getStatus());
                checkInBodies.add(res.getResponse().getContentAsString());
                return null;
            });
            Future<?> c2 = checkInPool.submit(() -> {
                checkInGate.await();
                MvcResult res = mockMvc.perform(patch("/api/appointments/{id}/status", raceApptId)
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"status":"CHECKED_IN"}
                                        """))
                        .andReturn();
                checkInStatuses.add(res.getResponse().getStatus());
                checkInBodies.add(res.getResponse().getContentAsString());
                return null;
            });
            checkInGate.countDown();
            c1.get();
            c2.get();
        } finally {
            checkInPool.shutdownNow();
        }

        assertThat(checkInStatuses).containsExactlyInAnyOrder(200, 409);
        int conflictIdx = checkInStatuses.indexOf(409);
        assertThat(jsonMapper.readTree(checkInBodies.get(conflictIdx)).get("code").asString())
                .isEqualTo("ILLEGAL_STATE_TRANSITION");

        Integer assignedToken = jdbcTemplate.queryForObject(
                "SELECT token_number FROM appointments WHERE id = ?", Integer.class, raceApptId);
        Integer lastCounterToken = jdbcTemplate.queryForObject(
                "SELECT last_token FROM doctor_day_counters WHERE doctor_id = ? AND counter_date = ?",
                Integer.class,
                doctorId,
                java.sql.Date.valueOf(clinicToday));
        assertThat(assignedToken).isEqualTo(3);
        assertThat(lastCounterToken).isEqualTo(3);
    }
}
