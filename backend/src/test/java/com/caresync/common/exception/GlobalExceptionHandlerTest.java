package com.caresync.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.caresync.auth.entity.Role;
import com.caresync.common.dto.ErrorResponse;
import com.caresync.common.security.SecurityEventLogger;
import com.caresync.common.security.UserPrincipal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

class GlobalExceptionHandlerTest {

    private final Clock fixedClock = Clock.fixed(Instant.parse("2026-11-11T10:00:00Z"), ZoneOffset.UTC);
    private final SecurityEventLogger securityEventLogger = new SecurityEventLogger();
    private final GlobalExceptionHandler handler = new GlobalExceptionHandler(fixedClock, securityEventLogger);

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void handlesCareSyncConflictAndRateLimitHeaders() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/auth/login");

        ResponseEntity<ErrorResponse> conflict = handler.handleCareSyncException(
                new ConflictException(ErrorCode.SLOT_ALREADY_BOOKED, "This slot is already booked"), request);
        assertThat(conflict.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(conflict.getBody()).isNotNull();
        assertThat(conflict.getBody().code()).isEqualTo("SLOT_ALREADY_BOOKED");
        assertThat(conflict.getBody().path()).isEqualTo("/api/auth/login");
        assertThat(conflict.getBody().fieldErrors()).isEmpty();

        ResponseEntity<ErrorResponse> limited = handler.handleCareSyncException(
                new TooManyRequestsException(30), request);
        assertThat(limited.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(limited.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("30");
    }

    @Test
    void handlesSecurityAndUnexpectedExceptionsWithoutLeakingDetailsAndLogsSecurityEvents() {
        Logger handlerLogger = (Logger) LoggerFactory.getLogger(GlobalExceptionHandler.class);
        Logger securityLogger = (Logger) LoggerFactory.getLogger("SECURITY_EVENTS");
        ListAppender<ILoggingEvent> handlerAppender = new ListAppender<>();
        ListAppender<ILoggingEvent> securityAppender = new ListAppender<>();
        handlerAppender.start();
        securityAppender.start();
        handlerLogger.addAppender(handlerAppender);
        securityLogger.addAppender(securityAppender);

        try {
            UUID userId = UUID.randomUUID();
            UserPrincipal principal = new UserPrincipal(
                    userId, "doctor@caresync.local", "Dr. Test", Role.DOCTOR, null, UUID.randomUUID());
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));

            MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/patients/123");
            request.setRemoteAddr("10.10.0.4");

            ResponseEntity<ErrorResponse> denied = handler.handleAccessDenied(
                    new AccessDeniedException("secret role detail"), request);
            assertThat(denied.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(denied.getBody().code()).isEqualTo("ACCESS_DENIED");
            assertThat(denied.getBody().message()).doesNotContain("secret");

            SecurityContextHolder.clearContext();
            ResponseEntity<ErrorResponse> unauth = handler.handleAuthenticationException(
                    new BadCredentialsException("internal cause secret"), request);
            assertThat(unauth.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
            assertThat(unauth.getBody().code()).isEqualTo("UNAUTHORIZED");

            ResponseEntity<ErrorResponse> internal = handler.handleUnexpected(
                    new RuntimeException("Patient Asha SSN 123-45-6789 leak",
                            new IllegalStateException("root PII Asha")),
                    request);
            assertThat(internal.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(internal.getBody().message()).doesNotContain("Asha");

            List<String> securityLogs = securityAppender.list.stream()
                    .map(ILoggingEvent::getFormattedMessage)
                    .toList();
            assertThat(securityLogs).hasSize(2);
            assertThat(securityLogs.get(0))
                    .contains("event=ACCESS_DENIED")
                    .contains("userId=" + userId)
                    .contains("role=DOCTOR")
                    .contains("path=/api/patients/123")
                    .doesNotContain("secret");
            assertThat(securityLogs.get(1))
                    .contains("event=UNAUTHORIZED")
                    .contains("reason=UNAUTHORIZED")
                    .contains("path=/api/patients/123")
                    .doesNotContain("internal cause");

            assertThat(handlerAppender.list).hasSize(1);
            ILoggingEvent errorLog = handlerAppender.list.getFirst();
            assertThat(errorLog.getThrowableProxy()).isNull();
            assertThat(errorLog.getFormattedMessage())
                    .contains("method=GET")
                    .contains("path=/api/patients/123")
                    .contains("type=java.lang.RuntimeException")
                    .contains("rootCauseType=java.lang.IllegalStateException")
                    .doesNotContain("Asha")
                    .doesNotContain("SSN");
        } finally {
            handlerLogger.detachAppender(handlerAppender);
            securityLogger.detachAppender(securityAppender);
        }
    }

    @Test
    void logsSingleAccessDeniedSecurityEventForServiceLayerForbiddenExceptionOnly() {
        Logger securityLogger = (Logger) LoggerFactory.getLogger("SECURITY_EVENTS");
        ListAppender<ILoggingEvent> securityAppender = new ListAppender<>();
        securityAppender.start();
        securityLogger.addAppender(securityAppender);

        try {
            UUID userId = UUID.randomUUID();
            UserPrincipal principal = new UserPrincipal(
                    userId, "patient@caresync.local", "Pat", Role.PATIENT, UUID.randomUUID(), null);
            SecurityContextHolder.getContext().setAuthentication(
                    new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));

            MockHttpServletRequest forbiddenReq = new MockHttpServletRequest("GET", "/api/patients/456");
            forbiddenReq.setRemoteAddr("10.10.0.8");
            ResponseEntity<ErrorResponse> forbidden = handler.handleCareSyncException(
                    new ForbiddenException("internal patient secret 456"), forbiddenReq);
            assertThat(forbidden.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(forbidden.getBody()).isNotNull();
            assertThat(forbidden.getBody().code()).isEqualTo("ACCESS_DENIED");

            ResponseEntity<ErrorResponse> conflict = handler.handleCareSyncException(
                    new ConflictException(ErrorCode.QUEUE_EMPTY, "empty"), forbiddenReq);
            assertThat(conflict.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);

            assertThat(securityAppender.list).hasSize(1);
            assertThat(securityAppender.list.getFirst().getFormattedMessage())
                    .contains("event=ACCESS_DENIED")
                    .contains("userId=" + userId)
                    .contains("role=PATIENT")
                    .contains("path=/api/patients/456")
                    .doesNotContain("secret");
        } finally {
            securityLogger.detachAppender(securityAppender);
        }
    }
}
