package com.caresync.common.security;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Dedicated structured logger for authentication and authorization security events.
 * Writes to the {@code SECURITY_EVENTS} logger without ever including PII (no emails, names, or tokens).
 */
@Component
public class SecurityEventLogger {

    private static final Logger log = LoggerFactory.getLogger("SECURITY_EVENTS");

    public void loginSucceeded(UUID userId, String role, String ip) {
        log.info("event=LOGIN_SUCCESS userId={} role={} ip={}", userId, role, sanitizeIp(ip));
    }

    public void loginFailed(String reason, String ip) {
        log.warn("event=LOGIN_FAILURE reason={} ip={}", reason, sanitizeIp(ip));
    }

    public void registerSucceeded(UUID userId, String role, String ip) {
        log.info("event=REGISTER_SUCCESS userId={} role={} ip={}", userId, role, sanitizeIp(ip));
    }

    public void tokenRefreshed(UUID userId, String ip) {
        log.info("event=TOKEN_REFRESHED userId={} ip={}", userId, sanitizeIp(ip));
    }

    public void refreshRejected(String reason, UUID userId, String ip) {
        log.warn("event=REFRESH_REJECTED reason={} userId={} ip={}", reason, userId, sanitizeIp(ip));
    }

    public void refreshReplayDetected(UUID userId, int revokedCount, String ip) {
        log.warn(
                "event=REFRESH_REPLAY_REVOKED userId={} revokedCount={} ip={}",
                userId,
                revokedCount,
                sanitizeIp(ip));
    }

    public void logoutCompleted(UUID userId, String ip) {
        log.info("event=LOGOUT userId={} ip={}", userId, sanitizeIp(ip));
    }

    public void unauthorizedAccess(String method, String path, String reason, String ip) {
        log.warn(
                "event=UNAUTHORIZED method={} path={} reason={} ip={}",
                sanitizeValue(method),
                sanitizeValue(path),
                sanitizeValue(reason),
                sanitizeIp(ip));
    }

    public void accessDenied(UserPrincipal principal, String method, String path, String ip) {
        accessDenied(
                principal != null ? principal.getUserId() : null,
                principal != null ? principal.getRole().name() : "ANONYMOUS",
                method,
                path,
                ip);
    }

    public void accessDenied(UUID userId, String role, String method, String path, String ip) {
        log.warn("event=ACCESS_DENIED userId={} role={} method={} path={} ip={}",
                userId, sanitizeValue(role), sanitizeValue(method), sanitizeValue(path), sanitizeIp(ip));
    }

    public void rateLimitExceeded(String method, String path, String ip) {
        log.warn(
                "event=RATE_LIMIT_EXCEEDED method={} path={} ip={}",
                sanitizeValue(method),
                sanitizeValue(path),
                sanitizeIp(ip));
    }

    private String sanitizeIp(String ip) {
        if (ip == null || ip.isBlank()) {
            return "unknown";
        }
        return ip.replaceAll("[\\r\\n\\s]", "");
    }

    private String sanitizeValue(String value) {
        if (value == null || value.isBlank()) {
            return "unknown";
        }
        return value.replaceAll("[\\r\\n\\s]", "");
    }
}
