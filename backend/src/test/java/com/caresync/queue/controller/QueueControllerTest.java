package com.caresync.queue.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.queue.dto.QueueBoardResponse;
import com.caresync.queue.dto.QueueEntry;
import com.caresync.queue.dto.QueueStateResponse;
import com.caresync.queue.dto.QueueTokenView;
import com.caresync.queue.service.QueueService;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(QueueController.class)
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class QueueControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private QueueService queueService;

    @BeforeEach
    void resetLimits() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void permitsPublicQueueBoardWithNoStoreAndSecuresDoctorQueueEndpoints() throws Exception {
        UUID clinicId = UUID.randomUUID();
        UUID doctorId = UUID.randomUUID();

        QueueBoardResponse board = new QueueBoardResponse(
                clinicId, "City Clinic", "Asia/Kolkata", LocalDate.of(2026, 6, 10),
                Instant.now(),
                List.of(new QueueTokenView(doctorId, "Dr. Rao", 1, List.of(2, 3), 2, 3)));
        when(queueService.getQueueBoard(clinicId)).thenReturn(board);

        mockMvc.perform(get("/api/queue/board").param("clinicId", clinicId.toString()))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(jsonPath("$.doctors[0].nowServing").value(1))
                .andExpect(jsonPath("$.doctors[0].patientName").doesNotExist());

        mockMvc.perform(get("/api/queue/board"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(get("/api/queue/doctors/{id}", doctorId))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/api/queue/doctors/{id}/call-next", doctorId))
                .andExpect(status().isUnauthorized());

        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "rec@caresync.local", "Rec", Role.RECEPTIONIST, null, null));

        QueueStateResponse state = new QueueStateResponse(
                doctorId, "Dr. Rao", clinicId, "Asia/Kolkata", LocalDate.of(2026, 6, 10),
                new QueueEntry(1, UUID.randomUUID(), UUID.randomUUID(), "Asha", Instant.now(), Instant.now()),
                List.of(), 0, 1, Instant.now());
        when(queueService.getDoctorQueue(any(), eq(doctorId))).thenReturn(state);
        when(queueService.callNext(any(), eq(doctorId))).thenReturn(state);

        mockMvc.perform(get("/api/queue/doctors/{id}", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nowServing.tokenNumber").value(1));

        mockMvc.perform(post("/api/queue/doctors/{id}/call-next", doctorId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nowServing.patientName").value("Asha"));
    }
}
