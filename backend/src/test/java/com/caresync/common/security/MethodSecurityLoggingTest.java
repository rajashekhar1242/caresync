package com.caresync.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.testsupport.SecuritySliceTestConfig;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@WebMvcTest(MethodSecurityLoggingTest.MethodSecurityProbeController.class)
@ActiveProfiles("test")
@Import({SecuritySliceTestConfig.class, MethodSecurityLoggingTest.MethodSecurityProbeController.class})
class MethodSecurityLoggingTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @BeforeEach
    void resetBuckets() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void preAuthorizeFailureLogsSingleAccessDeniedSecurityEventWithoutDuplicates() throws Exception {
        Logger securityLogger = (Logger) LoggerFactory.getLogger("SECURITY_EVENTS");
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        securityLogger.addAppender(appender);

        try {
            UUID userId = UUID.randomUUID();
            String patientToken = jwtService.generateAccessToken(new UserPrincipal(
                    userId, "patient@caresync.local", "Test Patient", Role.PATIENT, UUID.randomUUID(), null));

            mockMvc.perform(get("/api/test-method-security/admin-only")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientToken))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

            assertThat(appender.list).hasSize(1);
            assertThat(appender.list.getFirst().getFormattedMessage())
                    .contains("event=ACCESS_DENIED")
                    .contains("userId=" + userId)
                    .contains("role=PATIENT")
                    .contains("path=/api/test-method-security/admin-only");
        } finally {
            securityLogger.detachAppender(appender);
        }
    }

    @RestController
    static class MethodSecurityProbeController {

        @GetMapping("/api/test-method-security/admin-only")
        @PreAuthorize("hasRole('ADMIN')")
        String adminOnly() {
            return "ok";
        }
    }
}
