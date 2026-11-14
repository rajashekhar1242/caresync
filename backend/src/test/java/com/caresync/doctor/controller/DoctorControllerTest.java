package com.caresync.doctor.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.doctor.dto.DoctorResponse;
import com.caresync.doctor.service.DoctorService;
import com.caresync.testsupport.SecuritySliceTestConfig;
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

@WebMvcTest(DoctorController.class)
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class DoctorControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private DoctorService doctorService;

    @BeforeEach
    void resetLimits() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void enforcesAuthAndAdminRoleOnDoctorWrites() throws Exception {
        mockMvc.perform(get("/api/doctors")).andExpect(status().isUnauthorized());

        String patientJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "pat@caresync.local", "Pat", Role.PATIENT, UUID.randomUUID(), null));
        String adminJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "admin@caresync.local", "Admin", Role.ADMIN, null, null));

        mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Dr. Test","email":"d@caresync.local","password":"Password!123","specializationId":"%s","clinicId":"%s","departmentId":"%s","consultationFee":"500.00","slotMinutes":15}
                                """.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        UUID doctorId = UUID.randomUUID();
        DoctorResponse doc = new DoctorResponse(
                doctorId, UUID.randomUUID(), "Dr. Test",
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "500.00", 15, true);
        when(doctorService.listDoctors(any(), any(), any(), any(), any(Integer.class), any(Integer.class), any()))
                .thenReturn(new PageResponse<>(List.of(doc), 0, 20, 1, 1));
        when(doctorService.createDoctor(any())).thenReturn(doc);
        when(doctorService.updateDoctor(any(), any())).thenReturn(doc);

        mockMvc.perform(get("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].consultationFee").value("500.00"))
                .andExpect(jsonPath("$.content[0].phone").doesNotExist())
                .andExpect(jsonPath("$.content[0].email").doesNotExist());

        mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Dr. Test","email":"d@caresync.local","password":"Password!123","specializationId":"%s","clinicId":"%s","departmentId":"%s","consultationFee":"500.00","slotMinutes":15}
                                """.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(doctorId.toString()));

        mockMvc.perform(put("/api/doctors/{id}", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Dr. Test","specializationId":"%s","clinicId":"%s","departmentId":"%s","consultationFee":"500.00","slotMinutes":15,"active":true}
                                """.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())))
                .andExpect(status().isOk());

        // Rejects invalid money format
        mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Dr. Test","email":"d@caresync.local","password":"Password!123","specializationId":"%s","clinicId":"%s","departmentId":"%s","consultationFee":"500","slotMinutes":15}
                                """.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        when(doctorService.createDoctor(any())).thenThrow(new ValidationException("slotMinutes", "multiple of 5"));
        mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Dr. Test","email":"d@caresync.local","password":"Password!123","specializationId":"%s","clinicId":"%s","departmentId":"%s","consultationFee":"500.00","slotMinutes":17}
                                """.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }
}
