package com.caresync.patient.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.patient.dto.PatientResponse;
import com.caresync.patient.dto.PatientSummary;
import com.caresync.patient.entity.Gender;
import com.caresync.patient.service.PatientService;
import com.caresync.testsupport.SecuritySliceTestConfig;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(PatientController.class)
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class PatientControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private PatientService patientService;

    @BeforeEach
    void resetLimits() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void enforcesAuthenticationRolesAndValidations() throws Exception {
        mockMvc.perform(get("/api/patients")).andExpect(status().isUnauthorized());

        UUID patientId = UUID.randomUUID();
        String patientJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "pat@caresync.local", "Pat", Role.PATIENT, patientId, null));
        String doctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "doc@caresync.local", "Doc", Role.DOCTOR, null, UUID.randomUUID()));
        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "rec@caresync.local", "Rec", Role.RECEPTIONIST, null, null));

        // PATIENT cannot search or create walk-ins
        mockMvc.perform(get("/api/patients").header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        mockMvc.perform(post("/api/patients")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Test Pat","allergies":[]}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        // DOCTOR cannot create or update patient profiles
        mockMvc.perform(post("/api/patients")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Test Pat","allergies":[]}
                                """))
                .andExpect(status().isForbidden());

        mockMvc.perform(put("/api/patients/{patientId}", patientId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Test Pat","allergies":[]}
                                """))
                .andExpect(status().isForbidden());

        // Query & body validation
        mockMvc.perform(get("/api/patients?phone=abc")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        mockMvc.perform(post("/api/patients")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"A","dateOfBirth":"2099-01-01","allergies":["   "]}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        PatientSummary summary = new PatientSummary(
                patientId, "Test Pat", "+919876543210", LocalDate.of(1994, 6, 15), Gender.FEMALE);
        when(patientService.searchPatients(any(), eq("+9198"), eq("Test"), eq(0), eq(20)))
                .thenReturn(new PageResponse<>(List.of(summary), 0, 20, 1, 1));

        PatientResponse full = new PatientResponse(
                patientId, null, "Test Pat", LocalDate.of(1994, 6, 15), Gender.FEMALE,
                "+919876543210", "pat@example.com", "12 MG Road", List.of("Penicillin"),
                Instant.now(), Instant.now());
        when(patientService.createPatient(any())).thenReturn(full);
        when(patientService.getPatient(any(), eq(patientId))).thenReturn(full);
        when(patientService.updatePatient(any(), eq(patientId), any())).thenReturn(full);

        mockMvc.perform(get("/api/patients")
                        .param("phone", "+9198")
                        .param("name", "Test")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].fullName").value("Test Pat"))
                .andExpect(jsonPath("$.content[0].allergies").doesNotExist());

        mockMvc.perform(post("/api/patients")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Test Pat","dateOfBirth":"1994-06-15","gender":"FEMALE","phone":"+919876543210","email":"pat@example.com","address":"12 MG Road","allergies":["Penicillin"]}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(patientId.toString()))
                .andExpect(jsonPath("$.allergies[0]").value("Penicillin"));

        mockMvc.perform(get("/api/patients/{patientId}", patientId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(patientId.toString()));

        mockMvc.perform(put("/api/patients/{patientId}", patientId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Test Pat","allergies":[]}
                                """))
                .andExpect(status().isOk());
    }
}
