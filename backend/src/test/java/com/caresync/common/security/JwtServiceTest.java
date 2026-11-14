package com.caresync.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.CareSyncProperties;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.UnauthorizedException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class JwtServiceTest {

    private static final String TEST_SECRET =
            "dGVzdC1vbmx5LWp3dC1zZWNyZXQta2V5LWF0LWxlYXN0LTMyLWJ5dGVzLWZvci10ZXN0cw==";

    private static CareSyncProperties props(String secret, long accessExpirySeconds) {
        return new CareSyncProperties(
                new CareSyncProperties.Jwt(secret, accessExpirySeconds, 604800),
                new CareSyncProperties.Cors(List.of("http://localhost:3000")),
                new CareSyncProperties.RateLimit(5, 10, 20, 30),
                new CareSyncProperties.Reporting("Asia/Kolkata"),
                null);
    }

    @Test
    void issuesAndParsesPatientAndDoctorClaims() {
        Instant now = Instant.parse("2026-11-11T10:00:00Z");
        JwtService jwtService = new JwtService(props(TEST_SECRET, 900), Clock.fixed(now, ZoneOffset.UTC));

        UUID userId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();
        UserPrincipal principal = new UserPrincipal(userId, "pat@caresync.local", "Pat One", Role.PATIENT, patientId, null);

        String token = jwtService.generateAccessToken(principal);
        UserPrincipal parsed = jwtService.parseAccessToken(token);

        assertThat(parsed.getUserId()).isEqualTo(userId);
        assertThat(parsed.getEmail()).isEqualTo("pat@caresync.local");
        assertThat(parsed.getFullName()).isEqualTo("Pat One");
        assertThat(parsed.getRole()).isEqualTo(Role.PATIENT);
        assertThat(parsed.getPatientId()).isEqualTo(patientId);
        assertThat(parsed.getDoctorId()).isNull();
    }

    @Test
    void rejectsExpiredAccessTokenWithTokenExpiredCode() {
        Instant issuedAt = Instant.parse("2026-11-11T10:00:00Z");
        JwtService issuingService = new JwtService(props(TEST_SECRET, 60), Clock.fixed(issuedAt, ZoneOffset.UTC));
        UserPrincipal principal = new UserPrincipal(
                UUID.randomUUID(), "doc@caresync.local", "Dr. Rao", Role.DOCTOR, null, UUID.randomUUID());

        String token = issuingService.generateAccessToken(principal);

        JwtService laterService = new JwtService(
                props(TEST_SECRET, 60), Clock.fixed(issuedAt.plusSeconds(120), ZoneOffset.UTC));

        assertThatThrownBy(() -> laterService.parseAccessToken(token))
                .isInstanceOf(UnauthorizedException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.TOKEN_EXPIRED);
    }

    @Test
    void rejectsTamperedTokenAndShortSecret() {
        JwtService jwtService = new JwtService(props(TEST_SECRET, 900), Clock.systemUTC());
        UserPrincipal principal = new UserPrincipal(
                UUID.randomUUID(), "admin@caresync.local", "Admin", Role.ADMIN, null, null);
        String token = jwtService.generateAccessToken(principal);
        String tampered = token.substring(0, token.length() - 4) + "AAAA";

        assertThatThrownBy(() -> jwtService.parseAccessToken(tampered))
                .isInstanceOf(UnauthorizedException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.UNAUTHORIZED);

        assertThatThrownBy(() -> new JwtService(props("too-short", 900), Clock.systemUTC()))
                .isInstanceOf(IllegalStateException.class);
    }
}
