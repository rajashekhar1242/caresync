package com.caresync.audit.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.audit.dto.AuditLogResponse;
import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.entity.AuditEntityType;
import com.caresync.audit.service.AuditService;
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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AuditLogController.class)
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class AuditLogControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private AuditService auditService;

    @BeforeEach
    void resetLimits() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void enforcesAdminOnlyAuthorizationOnAuditLogsEndpoint() throws Exception {
        mockMvc.perform(get("/api/audit-logs"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        for (Role nonAdmin : List.of(Role.PATIENT, Role.DOCTOR, Role.RECEPTIONIST)) {
            String token = jwtService.generateAccessToken(new UserPrincipal(
                    UUID.randomUUID(), "user@caresync.local", "Non Admin", nonAdmin, null, null));
            mockMvc.perform(get("/api/audit-logs")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
        }
    }

    @Test
    void listsAuditLogsForAdminAndValidatesParameters() throws Exception {
        String adminToken = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "admin@caresync.local", "Admin", Role.ADMIN, null, null));
        UUID actorId = UUID.randomUUID();
        UUID entryId = UUID.randomUUID();
        Instant from = Instant.parse("2026-11-12T00:00:00Z");
        Instant to = Instant.parse("2026-11-13T00:00:00Z");

        AuditLogResponse item = new AuditLogResponse(
                entryId,
                Instant.parse("2026-11-12T08:00:00Z"),
                actorId,
                "Dr. Rao",
                Role.DOCTOR,
                AuditAction.CONSULTATION_CREATED,
                AuditEntityType.CONSULTATION,
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Created consultation",
                "127.0.0.1");
        when(auditService.listAuditLogs(any(), any(), any(), any(), any(), eq(1), eq(50)))
                .thenReturn(new PageResponse<>(List.of(item), 1, 50, 1, 1));

        mockMvc.perform(get("/api/audit-logs")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                        .param("userId", actorId.toString())
                        .param("action", "CONSULTATION_CREATED")
                        .param("entityType", "CONSULTATION")
                        .param("from", from.toString())
                        .param("to", to.toString())
                        .param("page", "1")
                        .param("size", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(entryId.toString()))
                .andExpect(jsonPath("$.content[0].action").value("CONSULTATION_CREATED"))
                .andExpect(jsonPath("$.page").value(1))
                .andExpect(jsonPath("$.size").value(50));

        verify(auditService).listAuditLogs(
                actorId, AuditAction.CONSULTATION_CREATED, AuditEntityType.CONSULTATION, from, to, 1, 50);

        mockMvc.perform(get("/api/audit-logs")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                        .param("page", "-1")
                        .param("size", "101"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors.length()").value(2));

        mockMvc.perform(get("/api/audit-logs")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken)
                        .param("action", "NOT_A_REAL_ACTION"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("MALFORMED_REQUEST"));
    }
}
