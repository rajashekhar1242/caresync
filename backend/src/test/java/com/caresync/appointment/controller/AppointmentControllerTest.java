package com.caresync.appointment.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.appointment.dto.AppointmentResponse;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.appointment.service.AppointmentService;
import com.caresync.appointment.service.StatusTransitionService;
import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.testsupport.SecuritySliceTestConfig;
import java.time.Instant;
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

@WebMvcTest(AppointmentController.class)
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class AppointmentControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private AppointmentService appointmentService;

    @MockitoBean
    private StatusTransitionService statusTransitionService;

    @BeforeEach
    void resetLimits() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void enforcesAuthRoleAndContractOnAppointmentEndpoints() throws Exception {
        mockMvc.perform(get("/api/appointments")).andExpect(status().isUnauthorized());

        UUID doctorId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();
        UUID appointmentId = UUID.randomUUID();

        String doctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "doc@caresync.local", "Dr", Role.DOCTOR, null, doctorId));
        String patientJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "pat@caresync.local", "Pat", Role.PATIENT, patientId, null));

        // DOCTOR cannot book appointment (403)
        mockMvc.perform(post("/api/appointments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"doctorId":"%s","patientId":"%s","slotStart":"2026-11-12T03:30:00Z"}
                                """.formatted(doctorId, patientId)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        // Invalid booking body -> 400
        mockMvc.perform(post("/api/appointments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"doctorId":"%s"}
                                """.formatted(doctorId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        AppointmentResponse resp = new AppointmentResponse(
                appointmentId, doctorId, "Dr. Rao", patientId, "Asha", UUID.randomUUID(), "Asia/Kolkata",
                Instant.parse("2026-11-12T03:30:00Z"), Instant.parse("2026-11-12T03:45:00Z"),
                AppointmentStatus.BOOKED, "Checkup", null, null, Instant.now(), Instant.now());

        when(appointmentService.listAppointments(any(), any(), any(), any(), any(), any(), eq(0), eq(20), eq("slotStart,asc")))
                .thenReturn(new PageResponse<>(List.of(resp), 0, 20, 1, 1));
        when(appointmentService.bookAppointment(any(), any())).thenReturn(resp);
        when(appointmentService.getAppointment(any(), eq(appointmentId))).thenReturn(resp);
        when(statusTransitionService.updateStatus(any(), eq(appointmentId), any())).thenReturn(resp);

        mockMvc.perform(get("/api/appointments?status=BOOKED,CHECKED_IN")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(appointmentId.toString()));

        mockMvc.perform(post("/api/appointments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"doctorId":"%s","patientId":"%s","slotStart":"2026-11-12T03:30:00Z","reason":"Checkup"}
                                """.formatted(doctorId, patientId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("BOOKED"));

        mockMvc.perform(get("/api/appointments/{id}", appointmentId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isOk());

        mockMvc.perform(patch("/api/appointments/{id}/status", appointmentId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"CANCELLED","reason":"Change of plans"}
                                """))
                .andExpect(status().isOk());
    }
}
