package com.caresync.clinical;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.config.RequestLoggingFilter;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.testsupport.BaseIntegrationTest;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.List;
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

class ClinicalIT extends BaseIntegrationTest {

    private static final UUID AUGMENTIN_ID = UUID.fromString("10000000-0000-4000-8000-000000000001");
    private static final UUID CLOPILET_ID = UUID.fromString("10000000-0000-4000-8000-000000000009");
    private static final UUID OMEZ_ID = UUID.fromString("10000000-0000-4000-8000-000000000011");

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
    void fullClinicalWorkflowConsultationsSafetyCheckPrescriptionsPdfAndFinalization() throws Exception {
        String adminJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000001"),
                "admin-test@caresync.local", "Admin", Role.ADMIN, null, null));
        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000002"),
                "receptionist-test@caresync.local", "Receptionist", Role.RECEPTIONIST, null, null));

        String unique = UUID.randomUUID().toString().substring(0, 8);
        UUID specId = jdbcTemplate.queryForObject("SELECT id FROM specializations ORDER BY name LIMIT 1", UUID.class);
        UUID clinicId = jdbcTemplate.queryForObject("SELECT id FROM clinics ORDER BY name LIMIT 1", UUID.class);
        String clinicTz = jdbcTemplate.queryForObject("SELECT time_zone FROM clinics WHERE id = ?", String.class, clinicId);
        ZoneId zone = ZoneId.of(clinicTz);
        LocalDate clinicToday = LocalDate.now(zone);

        MvcResult deptRes = mockMvc.perform(post("/api/departments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"ClinicalDept-%s"}
                                """.formatted(unique)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID deptId = UUID.fromString(jsonMapper.readTree(deptRes.getResponse().getContentAsString()).get("id").asString());

        MvcResult docRes = mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Dr. Clinical %s",
                                  "email": "doc.clinical.%s@caresync.local",
                                  "password": "Password!123",
                                  "specializationId": "%s",
                                  "clinicId": "%s",
                                  "departmentId": "%s",
                                  "consultationFee": "650.00",
                                  "slotMinutes": 15
                                }
                                """.formatted(unique, unique, specId, clinicId, deptId)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode docNode = jsonMapper.readTree(docRes.getResponse().getContentAsString());
        UUID doctorId = UUID.fromString(docNode.get("id").asString());
        UUID docUserId = UUID.fromString(docNode.get("userId").asString());
        String docJwt = jwtService.generateAccessToken(new UserPrincipal(
                docUserId, "doc.clinical." + unique + "@caresync.local", "Dr. Clinical " + unique, Role.DOCTOR, null, doctorId));

        MvcResult otherDocRes = mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Dr. Other %s",
                                  "email": "doc.other.%s@caresync.local",
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
        JsonNode otherDocNode = jsonMapper.readTree(otherDocRes.getResponse().getContentAsString());
        String otherDocJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString(otherDocNode.get("userId").asString()),
                "doc.other." + unique + "@caresync.local",
                "Dr. Other " + unique,
                Role.DOCTOR,
                null,
                UUID.fromString(otherDocNode.get("id").asString())));

        // Register a real patient with Penicillin allergy
        MvcResult regRes = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Ananya Clinical %s",
                                  "email": "pat.clinical.%s@caresync.local",
                                  "password": "Password!123"
                                }
                                """.formatted(unique, unique)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode regNode = jsonMapper.readTree(regRes.getResponse().getContentAsString());
        String patientJwt = regNode.get("accessToken").asString();
        UUID patientId = UUID.fromString(regNode.get("user").get("patientId").asString());

        mockMvc.perform(put("/api/patients/{id}", patientId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName": "Ananya Clinical %s",
                                  "allergies": ["Penicillin"]
                                }
                                """.formatted(unique)))
                .andExpect(status().isOk());

        // Insert a BOOKED appointment today, check it in, attempt premature consultation (409), then call-next
        Instant slotStart = clinicToday.atTime(LocalTime.of(10, 0)).atZone(zone).toInstant();
        Instant slotEnd = slotStart.plusSeconds(900);
        UUID appointmentId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status) VALUES (?, ?, ?, ?, ?, ?, 'BOOKED')",
                appointmentId, doctorId, patientId, clinicId, Timestamp.from(slotStart), Timestamp.from(slotEnd));

        mockMvc.perform(patch("/api/appointments/{id}/status", appointmentId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"CHECKED_IN"}
                                """))
                .andExpect(status().isOk());

        // Cannot start consultation before IN_CONSULTATION -> 409 APPOINTMENT_NOT_IN_CONSULTATION
        mockMvc.perform(post("/api/appointments/{id}/consultation", appointmentId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"symptoms":"Fever"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("APPOINTMENT_NOT_IN_CONSULTATION"));

        // Move to IN_CONSULTATION via call-next
        mockMvc.perform(post("/api/queue/doctors/{id}/call-next", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt))
                .andExpect(status().isOk());

        // Appointment exists without consultation -> GET returns 404
        mockMvc.perform(get("/api/appointments/{id}/consultation", appointmentId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt))
                .andExpect(status().isNotFound());

        // Create draft consultation (blank diagnosis)
        MvcResult consultRes = mockMvc.perform(post("/api/appointments/{id}/consultation", appointmentId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "vitals": {"bloodPressure":"120/80","pulse":76,"temperature":37.2,"spo2":98},
                                  "symptoms": "Sore throat and mild fever",
                                  "notes": "Initial draft"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.finalized").value(false))
                .andReturn();
        UUID consultationId = UUID.fromString(jsonMapper.readTree(consultRes.getResponse().getContentAsString()).get("id").asString());

        // RECEPTIONIST and unrelated doctor are forbidden from reading consultation
        mockMvc.perform(get("/api/consultations/{id}", consultationId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/consultations/{id}", consultationId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherDocJwt))
                .andExpect(status().isForbidden());

        // Cannot complete appointment while diagnosis is blank -> 409 CONSULTATION_INCOMPLETE
        mockMvc.perform(patch("/api/appointments/{id}/status", appointmentId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"COMPLETED"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONSULTATION_INCOMPLETE"));

        // Search medicine catalog
        mockMvc.perform(get("/api/medicines").param("name", "Penicillin")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2));

        // Safety check: Penicillin allergy (SEVERE) + Clopilet/Omez interaction (MODERATE)
        mockMvc.perform(post("/api/prescriptions/check")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "patientId": "%s",
                                  "medicineIds": ["%s", "%s", "%s"]
                                }
                                """.formatted(patientId, CLOPILET_ID, OMEZ_ID, AUGMENTIN_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.warnings.length()").value(2))
                .andExpect(jsonPath("$.warnings[0].type").value("ALLERGY"))
                .andExpect(jsonPath("$.warnings[0].severity").value("SEVERE"))
                .andExpect(jsonPath("$.warnings[1].type").value("INTERACTION"))
                .andExpect(jsonPath("$.warnings[1].severity").value("MODERATE"));

        // Unrelated doctor gets 403 on checkPrescription
        mockMvc.perform(post("/api/prescriptions/check")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + otherDocJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"patientId": "%s", "medicineIds": ["%s"]}
                                """.formatted(patientId, AUGMENTIN_ID)))
                .andExpect(status().isForbidden());

        // Create prescription without acknowledge -> 409 SEVERE_WARNING_NOT_ACKNOWLEDGED
        mockMvc.perform(post("/api/prescriptions")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "consultationId": "%s",
                                  "items": [
                                    {"medicineId":"%s","dosage":"625 mg","frequency":"1-0-1","durationDays":5,"instructions":"After food"},
                                    {"medicineId":"%s","dosage":"75 mg","frequency":"0-1-0","durationDays":14},
                                    {"medicineId":"%s","dosage":"20 mg","frequency":"1-0-0","durationDays":14}
                                  ],
                                  "acknowledgeSevereWarnings": false
                                }
                                """.formatted(consultationId, AUGMENTIN_ID, CLOPILET_ID, OMEZ_ID)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("SEVERE_WARNING_NOT_ACKNOWLEDGED"));

        // Acknowledge severe warnings -> 201 Created
        MvcResult rxRes = mockMvc.perform(post("/api/prescriptions")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "consultationId": "%s",
                                  "items": [
                                    {"medicineId":"%s","dosage":"625 mg","frequency":"1-0-1","durationDays":5,"instructions":"After food"},
                                    {"medicineId":"%s","dosage":"75 mg","frequency":"0-1-0","durationDays":14},
                                    {"medicineId":"%s","dosage":"20 mg","frequency":"1-0-0","durationDays":14}
                                  ],
                                  "acknowledgeSevereWarnings": true
                                }
                                """.formatted(consultationId, AUGMENTIN_ID, CLOPILET_ID, OMEZ_ID)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.severeWarningsAcknowledged").value(true))
                .andExpect(jsonPath("$.warnings.length()").value(2))
                .andReturn();
        UUID rxId = UUID.fromString(jsonMapper.readTree(rxRes.getResponse().getContentAsString()).get("id").asString());

        // Second prescription for same consultation -> 409 PRESCRIPTION_ALREADY_EXISTS
        mockMvc.perform(post("/api/prescriptions")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "consultationId": "%s",
                                  "items": [{"medicineId":"%s","dosage":"75 mg","frequency":"0-1-0","durationDays":5}]
                                }
                                """.formatted(consultationId, CLOPILET_ID)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("PRESCRIPTION_ALREADY_EXISTS"));

        // Patient reads prescription, lists prescriptions, and downloads PDF
        mockMvc.perform(get("/api/prescriptions/{id}", rxId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(3));

        mockMvc.perform(get("/api/patients/{id}/prescriptions", patientId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(rxId.toString()));

        MvcResult pdfRes = mockMvc.perform(get("/api/prescriptions/{id}/pdf", rxId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .accept(MediaType.APPLICATION_PDF, MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(header().string(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"prescription-" + rxId.toString().substring(0, 8) + ".pdf\""))
                .andReturn();
        byte[] pdfBytes = pdfRes.getResponse().getContentAsByteArray();
        assertThat(new String(pdfBytes, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");

        // Update consultation with diagnosis and complete appointment -> finalizes consultation
        mockMvc.perform(put("/api/consultations/{id}", consultationId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "symptoms": "Sore throat and mild fever",
                                  "diagnosis": "Acute bacterial pharyngitis",
                                  "followUpDate": "%s"
                                }
                                """.formatted(clinicToday.plusDays(5))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.vitals").isEmpty());

        mockMvc.perform(patch("/api/appointments/{id}/status", appointmentId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"COMPLETED"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        // Consultation is now finalized and read-only
        mockMvc.perform(get("/api/consultations/{id}", consultationId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.finalized").value(true));

        mockMvc.perform(put("/api/consultations/{id}", consultationId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"diagnosis":"Cannot edit"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONSULTATION_FINALIZED"));

        // Verify clinical audit trail entries
        List<String> recordedActions = jdbcTemplate.queryForList(
                "SELECT action FROM audit_logs WHERE patient_id = ?",
                String.class,
                patientId);
        assertThat(recordedActions).contains(
                "CONSULTATION_CREATED",
                "CONSULTATION_UPDATED",
                "CONSULTATION_FINALIZED",
                "CONSULTATION_READ",
                "PRESCRIPTION_CREATED",
                "PRESCRIPTION_READ",
                "PRESCRIPTION_LIST_READ",
                "PRESCRIPTION_PDF_DOWNLOADED");
    }
}
