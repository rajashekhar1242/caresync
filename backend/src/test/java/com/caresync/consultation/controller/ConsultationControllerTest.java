package com.caresync.consultation.controller;

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
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.consultation.dto.ConsultationResponse;
import com.caresync.consultation.dto.VitalsDto;
import com.caresync.consultation.service.ConsultationService;
import com.caresync.testsupport.SecuritySliceTestConfig;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
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

@WebMvcTest(ConsultationController.class)
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class ConsultationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private ConsultationService consultationService;

    @BeforeEach
    void resetLimits() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void enforcesAuthValidationAndRoutesForConsultations() throws Exception {
        UUID appointmentId = UUID.randomUUID();
        UUID consultationId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();
        UUID doctorId = UUID.randomUUID();

        mockMvc.perform(get("/api/appointments/{id}/consultation", appointmentId))
                .andExpect(status().isUnauthorized());

        String docJwt = jwtService.generateAccessToken(
                new UserPrincipal(UUID.randomUUID(), "doc@clinic.test", "Dr. Rao", Role.DOCTOR, null, doctorId));

        mockMvc.perform(post("/api/appointments/{id}/consultation", appointmentId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"vitals":{"bloodPressure":"invalid","pulse":500}}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        ConsultationResponse response = new ConsultationResponse(
                consultationId, appointmentId, patientId, "Priya", doctorId, "Dr. Rao",
                new VitalsDto("120/80", 72, new BigDecimal("36.8"), new BigDecimal("65.0"), 99),
                "Chest tightness", "Stable angina", "Rest", LocalDate.of(2026, 6, 20),
                false, null, Instant.now(), Instant.now());

        when(consultationService.createConsultation(any(), eq(appointmentId), any())).thenReturn(response);
        when(consultationService.getAppointmentConsultation(any(), eq(appointmentId))).thenReturn(response);
        when(consultationService.getConsultation(any(), eq(consultationId))).thenReturn(response);
        when(consultationService.updateConsultation(any(), eq(consultationId), any())).thenReturn(response);

        mockMvc.perform(post("/api/appointments/{id}/consultation", appointmentId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "vitals":{"bloodPressure":"120/80","pulse":72,"temperature":36.8,"weightKg":65.0,"spo2":99},
                                  "symptoms":"Chest tightness",
                                  "diagnosis":"Stable angina"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(consultationId.toString()))
                .andExpect(jsonPath("$.diagnosis").value("Stable angina"));

        mockMvc.perform(get("/api/appointments/{id}/consultation", appointmentId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.vitals.bloodPressure").value("120/80"));

        mockMvc.perform(get("/api/consultations/{id}", consultationId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.finalized").value(false));

        mockMvc.perform(put("/api/consultations/{id}", consultationId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"symptoms":"Updated","diagnosis":"Confirmed"}
                                """))
                .andExpect(status().isOk());
    }
}
