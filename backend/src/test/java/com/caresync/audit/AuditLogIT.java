package com.caresync.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.service.AuditService;
import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.config.RequestLoggingFilter;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.testsupport.BaseIntegrationTest;
import java.time.Instant;
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
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;

class AuditLogIT extends BaseIntegrationTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private AuditService auditService;

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

    @Autowired
    private PlatformTransactionManager transactionManager;

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
    void filtersAuditLogsNewestFirstWithInclusiveFromExclusiveToAndNoSelfAudit() throws Exception {
        UUID actorA = UUID.randomUUID();
        UUID actorB = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();
        UUID invoiceId = UUID.randomUUID();

        var first = auditService.record(
                actorA, "Dr. First", Role.DOCTOR, AuditAction.PATIENT_READ, patientId, patientId,
                "First read", "10.0.0.10");
        Thread.sleep(5);
        var second = auditService.record(
                actorA, "Dr. First", Role.DOCTOR, AuditAction.INVOICE_READ, invoiceId, patientId,
                "Second read", "10.0.0.10");
        Thread.sleep(5);
        var third = auditService.record(
                actorB, "Admin B", Role.ADMIN, AuditAction.PAYMENT_RECORDED, invoiceId, patientId,
                "Payment of 500.00 by UPI", "10.0.0.20");

        // Login as bootstrapped ADMIN
        MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"admin-test@caresync.local","password":"TestAdmin!Password123"}
                                """))
                .andExpect(status().isOk())
                .andReturn();
        String adminJwt = jsonMapper.readTree(loginResult.getResponse().getContentAsString())
                .get("accessToken").asString();

        // Count before GET /api/audit-logs to verify reading audit logs is not itself audited
        Integer countBefore = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM audit_logs", Integer.class);

        // Inclusive from = first.occurredAt, exclusive to = third.occurredAt -> returns [second, first]
        mockMvc.perform(get("/api/audit-logs")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("userId", actorA.toString())
                        .param("from", first.getOccurredAt().toString())
                        .param("to", third.getOccurredAt().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.content[0].id").value(second.getId().toString()))
                .andExpect(jsonPath("$.content[1].id").value(first.getId().toString()));

        // Combine action + entityType filter
        mockMvc.perform(get("/api/audit-logs")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("action", "PAYMENT_RECORDED")
                        .param("entityType", "INVOICE")
                        .param("userId", actorB.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(third.getId().toString()))
                .andExpect(jsonPath("$.content[0].details").value("Payment of 500.00 by UPI"));

        // Invalid range: from == to -> 400 VALIDATION_FAILED
        Instant ts = second.getOccurredAt();
        mockMvc.perform(get("/api/audit-logs")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("from", ts.toString())
                        .param("to", ts.toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        // Non-ADMIN receives 403 ACCESS_DENIED
        String doctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                actorA, "dr@caresync.local", "Dr. First", Role.DOCTOR, null, UUID.randomUUID()));
        mockMvc.perform(get("/api/audit-logs")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        Integer countAfter = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM audit_logs", Integer.class);
        assertThat(countAfter).isEqualTo(countBefore);
    }

    @Test
    void auditRecordRollsBackAtomicallyWithCallerTransaction() {
        UUID entityId = UUID.randomUUID();
        TransactionTemplate txTemplate = new TransactionTemplate(transactionManager);
        txTemplate.executeWithoutResult(status -> {
            auditService.record(
                    UUID.randomUUID(),
                    "Rollback Actor",
                    Role.DOCTOR,
                    AuditAction.CONSULTATION_CREATED,
                    entityId,
                    null,
                    "Should roll back",
                    "127.0.0.1");
            status.setRollbackOnly();
        });

        Integer persisted = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM audit_logs WHERE entity_id = ?", Integer.class, entityId);
        assertThat(persisted).isZero();
    }
}
