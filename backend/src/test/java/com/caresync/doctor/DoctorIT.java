package com.caresync.doctor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
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

class DoctorIT extends BaseIntegrationTest {

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
    void fullDoctorLifecycleVisibilityFilteringSortingAndLoginIntegration() throws Exception {
        String adminJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000001"),
                "admin-test@caresync.local", "Admin", Role.ADMIN, null, null));
        String patientJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "pat@caresync.local", "Patient", Role.PATIENT, UUID.randomUUID(), null));
        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "rec@caresync.local", "Receptionist", Role.RECEPTIONIST, null, null));

        UUID specId = jdbcTemplate.queryForObject("SELECT id FROM specializations ORDER BY name LIMIT 1", UUID.class);
        UUID clinicId = jdbcTemplate.queryForObject("SELECT id FROM clinics ORDER BY name LIMIT 1", UUID.class);

        // Create a department for doctors
        String unique = UUID.randomUUID().toString().substring(0, 8);
        MvcResult deptRes = mockMvc.perform(post("/api/departments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"DocDept %s"}
                                """.formatted(unique)))
                .andExpect(status().isCreated())
                .andReturn();
        UUID deptId = UUID.fromString(jsonMapper.readTree(deptRes.getResponse().getContentAsString()).get("id").asString());

        String drAlphaEmail = "alpha-" + unique + "@caresync.local";
        String drBetaEmail = "beta-" + unique + "@caresync.local";

        MvcResult alphaRes = mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Dr. Alpha %s","email":"%s","password":"DocPassword!123","phone":"+919811110001","specializationId":"%s","clinicId":"%s","departmentId":"%s","consultationFee":"1200.00","slotMinutes":15}
                                """.formatted(unique, drAlphaEmail, specId, clinicId, deptId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.consultationFee").value("1200.00"))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.phone").doesNotExist())
                .andReturn();
        JsonNode alphaJson = jsonMapper.readTree(alphaRes.getResponse().getContentAsString());
        String alphaId = alphaJson.get("id").asString();

        MvcResult betaRes = mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Dr. Beta %s","email":"%s","password":"DocPassword!123","specializationId":"%s","clinicId":"%s","departmentId":"%s","consultationFee":"600.00","slotMinutes":20}
                                """.formatted(unique, drBetaEmail, specId, clinicId, deptId)))
                .andExpect(status().isCreated())
                .andReturn();
        String betaId = jsonMapper.readTree(betaRes.getResponse().getContentAsString()).get("id").asString();

        // Duplicate email returns 409 EMAIL_ALREADY_EXISTS
        mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Dr. Dup","email":"%s","password":"DocPassword!123","specializationId":"%s","clinicId":"%s","departmentId":"%s","consultationFee":"600.00","slotMinutes":15}
                                """.formatted(drAlphaEmail.toUpperCase(), specId, clinicId, deptId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"));

        // Doctor can log in and UserResponse contains linked doctorId
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"DocPassword!123"}
                                """.formatted(drAlphaEmail)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("DOCTOR"))
                .andExpect(jsonPath("$.user.doctorId").value(alphaId));

        // Deactivate Beta via PUT
        mockMvc.perform(put("/api/doctors/{id}", betaId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Dr. Beta %s","specializationId":"%s","clinicId":"%s","departmentId":"%s","consultationFee":"650.00","slotMinutes":30,"active":false}
                                """.formatted(unique, specId, clinicId, deptId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.consultationFee").value("650.00"));

        // PATIENT cannot see inactive Beta (list excludes Beta; GET /{betaId} returns 404)
        MvcResult patientListRes = mockMvc.perform(get("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .param("name", unique))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode patientContent = jsonMapper.readTree(patientListRes.getResponse().getContentAsString()).get("content");
        assertThat(patientContent.size()).isEqualTo(1);
        assertThat(patientContent.get(0).get("id").asString()).isEqualTo(alphaId);

        mockMvc.perform(get("/api/doctors/{id}", betaId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

        // Staff (RECEPTIONIST) sees both, sorted by consultationFee,asc -> Beta (650.00) before Alpha (1200.00)
        mockMvc.perform(get("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .param("name", unique)
                        .param("sort", "consultationFee,asc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[0].id").value(betaId))
                .andExpect(jsonPath("$.content[1].id").value(alphaId));

        mockMvc.perform(get("/api/doctors/{id}", betaId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
    }
}
