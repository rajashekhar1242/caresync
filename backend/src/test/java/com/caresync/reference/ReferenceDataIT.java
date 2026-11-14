package com.caresync.reference;

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
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class ReferenceDataIT extends BaseIntegrationTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JsonMapper jsonMapper;

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
    void returnsSeededClinicsAndSpecializationsSortedByNameAndEnforcesDepartmentUniqueness() throws Exception {
        String patientJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "pat@caresync.local", "Patient", Role.PATIENT, UUID.randomUUID(), null));
        String adminJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000001"),
                "admin-test@caresync.local",
                "Admin",
                Role.ADMIN,
                null,
                null));

        // Seeded specializations (8 rows sorted by name)
        MvcResult specRes = mockMvc.perform(get("/api/specializations")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode specs = jsonMapper.readTree(specRes.getResponse().getContentAsString());
        assertThat(specs.size()).isEqualTo(8);
        List<String> specNames = new ArrayList<>();
        specs.forEach(node -> specNames.add(node.get("name").asString()));
        assertThat(specNames).isSortedAccordingTo(Comparator.naturalOrder());

        // Seeded clinics (3 rows sorted by name with timeZone)
        MvcResult clinicRes = mockMvc.perform(get("/api/clinics")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode clinics = jsonMapper.readTree(clinicRes.getResponse().getContentAsString());
        assertThat(clinics.size()).isEqualTo(3);
        List<String> clinicNames = new ArrayList<>();
        clinics.forEach(node -> {
            clinicNames.add(node.get("name").asString());
            assertThat(node.get("timeZone").asString()).isNotBlank();
        });
        assertThat(clinicNames).isSortedAccordingTo(Comparator.naturalOrder());

        // Create and update department + enforce uq_departments_name_lower
        String uniqueSuffix = UUID.randomUUID().toString().substring(0, 8);
        String deptName = "Cardiology " + uniqueSuffix;

        MvcResult createdRes = mockMvc.perform(post("/api/departments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","description":"Heart care"}
                                """.formatted(deptName)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value(deptName))
                .andReturn();
        String deptId = jsonMapper.readTree(createdRes.getResponse().getContentAsString()).get("id").asString();

        // Case-insensitive duplicate rejected with 409 DEPARTMENT_NAME_EXISTS
        mockMvc.perform(post("/api/departments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","description":"Duplicate"}
                                """.formatted(deptName.toLowerCase())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DEPARTMENT_NAME_EXISTS"));

        String updatedName = "Updated Dept " + uniqueSuffix;
        mockMvc.perform(put("/api/departments/{id}", deptId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s","description":"Updated desc"}
                                """.formatted(updatedName)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value(updatedName))
                .andExpect(jsonPath("$.description").value("Updated desc"));

        // Missing department -> 404 RESOURCE_NOT_FOUND
        mockMvc.perform(put("/api/departments/{id}", UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Missing Dept"}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }
}
