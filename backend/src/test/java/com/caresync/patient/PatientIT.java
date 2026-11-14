package com.caresync.patient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.config.RequestLoggingFilter;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.testsupport.BaseIntegrationTest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
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

class PatientIT extends BaseIntegrationTest {

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
    void walkInSearchAllergiesAuditAndDoctorOwnershipEndToEnd() throws Exception {
        String adminJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000001"),
                "admin-test@caresync.local", "Admin", Role.ADMIN, null, null));
        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000002"),
                "receptionist-test@caresync.local", "Receptionist", Role.RECEPTIONIST, null, null));

        String unique = UUID.randomUUID().toString().substring(0, 8);
        String phoneA = "+91911" + String.format("%07d", Math.abs(unique.hashCode()) % 10_000_000);
        String phoneB = "+91922" + String.format("%07d", Math.abs(unique.hashCode()) % 10_000_000);

        // 1. Create two walk-in patients (testing text[] allergies dedup + replacement)
        MvcResult createA = mockMvc.perform(post("/api/patients")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Kiran Rao %s",
                                  "dateOfBirth": "1992-03-14",
                                  "gender": "FEMALE",
                                  "phone": "%s",
                                  "email": "Kiran.%s@Example.COM",
                                  "address": "42 Residency Rd",
                                  "allergies": ["  Penicillin  ", "penicillin", "Peanuts"]
                                }
                                """.formatted(unique, phoneA, unique)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.userId").isEmpty())
                .andExpect(jsonPath("$.email").value(("kiran." + unique + "@example.com").toLowerCase()))
                .andExpect(jsonPath("$.allergies.length()").value(2))
                .andExpect(jsonPath("$.allergies[0]").value("Penicillin"))
                .andExpect(jsonPath("$.allergies[1]").value("Peanuts"))
                .andReturn();
        UUID patientAId = UUID.fromString(jsonMapper.readTree(createA.getResponse().getContentAsString()).get("id").asString());

        MvcResult createB = mockMvc.perform(post("/api/patients")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Vikram Rao %s",
                                  "phone": "%s",
                                  "allergies": ["Latex"]
                                }
                                """.formatted(unique, phoneB)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID patientBId = UUID.fromString(jsonMapper.readTree(createB.getResponse().getContentAsString()).get("id").asString());

        // 2. Search by phone prefix + name contains + AND combination -> summary only
        mockMvc.perform(get("/api/patients")
                        .param("phone", phoneA.substring(0, 7))
                        .param("name", "rao " + unique.substring(0, 4))
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(patientAId.toString()))
                .andExpect(jsonPath("$.content[0].allergies").doesNotExist())
                .andExpect(jsonPath("$.content[0].address").doesNotExist());

        // 3. Get full record writes PATIENT_READ audit log
        mockMvc.perform(get("/api/patients/{id}", patientAId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allergies[0]").value("Penicillin"));

        Integer readAudits = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM audit_logs WHERE action = 'PATIENT_READ' AND entity_id = ? AND patient_id = ?",
                Integer.class,
                patientAId,
                patientAId);
        assertThat(readAudits).isEqualTo(1);

        // 4. Missing patient returns 404 before 403
        UUID missingId = UUID.randomUUID();
        mockMvc.perform(get("/api/patients/{id}", missingId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

        // 5. Full replacement clears allergies when [] is passed
        mockMvc.perform(put("/api/patients/{id}", patientAId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Kiran Rao Updated %s",
                                  "phone": "%s",
                                  "allergies": []
                                }
                                """.formatted(unique, phoneA)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fullName").value("Kiran Rao Updated " + unique))
                .andExpect(jsonPath("$.dateOfBirth").isEmpty())
                .andExpect(jsonPath("$.address").isEmpty())
                .andExpect(jsonPath("$.allergies.length()").value(0));

        // 6. Doctor own-patient scoping (BOOKED grants access, CANCELLED does not)
        UUID specId = jdbcTemplate.queryForObject("SELECT id FROM specializations ORDER BY name LIMIT 1", UUID.class);
        UUID clinicId = jdbcTemplate.queryForObject("SELECT id FROM clinics ORDER BY name LIMIT 1", UUID.class);
        MvcResult deptRes = mockMvc.perform(post("/api/departments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"PatDept-%s"}
                                """.formatted(unique)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID deptId = UUID.fromString(jsonMapper.readTree(deptRes.getResponse().getContentAsString()).get("id").asString());

        MvcResult docRes = mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Dr. PatScope %s",
                                  "email": "doc.patscope.%s@caresync.local",
                                  "password": "Password!123",
                                  "specializationId": "%s",
                                  "clinicId": "%s",
                                  "departmentId": "%s",
                                  "consultationFee": "500.00",
                                  "slotMinutes": 15
                                }
                                """.formatted(unique, unique, specId, clinicId, deptId)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode docJson = jsonMapper.readTree(docRes.getResponse().getContentAsString());
        UUID doctorId = UUID.fromString(docJson.get("id").asString());
        UUID doctorUserId = UUID.fromString(docJson.get("userId").asString());
        String doctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                doctorUserId, "doc.patscope." + unique + "@caresync.local",
                "Dr. PatScope " + unique, Role.DOCTOR, null, doctorId));

        Instant slotA = Instant.parse("2026-06-20T09:00:00Z");
        Instant slotB = Instant.parse("2026-06-20T09:15:00Z");
        jdbcTemplate.update(
                """
                INSERT INTO appointments (id, patient_id, doctor_id, clinic_id, slot_start, slot_end, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                UUID.randomUUID(), patientAId, doctorId, clinicId,
                Timestamp.from(slotA), Timestamp.from(slotA.plusSeconds(900)), "BOOKED");
        jdbcTemplate.update(
                """
                INSERT INTO appointments (id, patient_id, doctor_id, clinic_id, slot_start, slot_end, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                UUID.randomUUID(), patientBId, doctorId, clinicId,
                Timestamp.from(slotB), Timestamp.from(slotB.plusSeconds(900)), "CANCELLED");

        mockMvc.perform(get("/api/patients")
                        .param("name", unique)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(patientAId.toString()));

        // Combined phone + name filter + EXISTS doctor scope + pagination + ADMIN visibility comparison
        String phoneC = "+91911" + String.format("%07d", (Math.abs(unique.hashCode()) + 1) % 10_000_000);
        MvcResult createC = mockMvc.perform(post("/api/patients")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Aarav Rao %s",
                                  "phone": "%s",
                                  "allergies": []
                                }
                                """.formatted(unique, phoneC)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID patientCId = UUID.fromString(jsonMapper.readTree(createC.getResponse().getContentAsString()).get("id").asString());
        Instant slotC = Instant.parse("2026-06-20T09:30:00Z");
        jdbcTemplate.update(
                """
                INSERT INTO appointments (id, patient_id, doctor_id, clinic_id, slot_start, slot_end, status)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                UUID.randomUUID(), patientCId, doctorId, clinicId,
                Timestamp.from(slotC), Timestamp.from(slotC.plusSeconds(900)), "BOOKED");

        // Doctor sees Aarav (patientC) then Kiran (patientA) sorted by fullName ASC, paginated size=1
        mockMvc.perform(get("/api/patients")
                        .param("name", unique)
                        .param("phone", "+91911")
                        .param("page", "0")
                        .param("size", "1")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(patientCId.toString()));

        mockMvc.perform(get("/api/patients")
                        .param("name", unique)
                        .param("phone", "+91911")
                        .param("page", "1")
                        .param("size", "1")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(patientAId.toString()));

        // ADMIN still sees all 3 matching patients including CANCELLED-only patientB
        mockMvc.perform(get("/api/patients")
                        .param("name", unique)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(3));

        mockMvc.perform(get("/api/patients/{id}", patientAId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt))
                .andExpect(status().isOk());

        Logger securityLogger = (Logger) LoggerFactory.getLogger("SECURITY_EVENTS");
        ListAppender<ILoggingEvent> securityAppender = new ListAppender<>();
        securityAppender.start();
        securityLogger.addAppender(securityAppender);
        try {
            mockMvc.perform(get("/api/patients/{id}", patientBId)
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

            assertThat(securityAppender.list).hasSize(1);
            assertThat(securityAppender.list.getFirst().getFormattedMessage())
                    .contains("event=ACCESS_DENIED")
                    .contains("userId=" + doctorUserId)
                    .contains("role=DOCTOR")
                    .contains("path=/api/patients/" + patientBId);
        } finally {
            securityLogger.detachAppender(securityAppender);
        }

        // 7. Self-registered PATIENT own-record read/update and other-record denial
        MvcResult regRes = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Self Pat %s",
                                  "email": "self.pat.%s@caresync.local",
                                  "password": "Password!123",
                                  "phone": "+919334455667"
                                }
                                """.formatted(unique, unique)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode regJson = jsonMapper.readTree(regRes.getResponse().getContentAsString());
        String selfJwt = regJson.get("accessToken").asString();
        UUID selfPatientId = UUID.fromString(regJson.get("user").get("patientId").asString());

        mockMvc.perform(get("/api/patients/{id}", selfPatientId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + selfJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(selfPatientId.toString()));

        mockMvc.perform(put("/api/patients/{id}", selfPatientId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + selfJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Self Pat Updated",
                                  "phone": "+919334455667",
                                  "allergies": ["Shellfish", "shellfish"]
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.allergies.length()").value(1))
                .andExpect(jsonPath("$.allergies[0]").value("Shellfish"));

        mockMvc.perform(get("/api/patients/{id}", patientAId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + selfJwt))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/patients")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + selfJwt))
                .andExpect(status().isForbidden());

        mockMvc.perform(put("/api/patients/{id}", patientAId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + selfJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Forbidden","allergies":[]}
                                """))
                .andExpect(status().isForbidden());
    }
}
