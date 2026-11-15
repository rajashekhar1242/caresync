package com.caresync.common.security;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.CareSyncProperties;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.UnauthorizedException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.io.DecodingException;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;

/**
 * Issues and verifies HS256 JWT access tokens using JJWT 0.13.0.
 */
@Service
public class JwtService {

    private final SecretKey signingKey;
    private final long accessTokenExpirySeconds;
    private final Clock clock;

    public JwtService(CareSyncProperties properties, Clock clock) {
        this.clock = clock;
        CareSyncProperties.Jwt jwtProps = properties.jwt();
        if (jwtProps == null || jwtProps.secret() == null || jwtProps.secret().isBlank()
                || (jwtProps.secret().startsWith("${") && jwtProps.secret().endsWith("}"))) {
            throw new IllegalStateException("caresync.jwt.secret must be configured");
        }
        this.signingKey = deriveSigningKey(jwtProps.secret());
        this.accessTokenExpirySeconds = jwtProps.accessTokenExpirySeconds() > 0
                ? jwtProps.accessTokenExpirySeconds()
                : 900L;
    }

    private SecretKey deriveSigningKey(String configuredSecret) {
        String trimmed = configuredSecret.trim();
        byte[] keyBytes;
        try {
            byte[] decoded = Decoders.BASE64.decode(trimmed);
            keyBytes = decoded.length >= 32 ? decoded : trimmed.getBytes(StandardCharsets.UTF_8);
        } catch (DecodingException | IllegalArgumentException ignored) {
            keyBytes = trimmed.getBytes(StandardCharsets.UTF_8);
        }
        if (keyBytes.length < 32) {
            throw new IllegalStateException("caresync.jwt.secret must be at least 32 bytes (256 bits)");
        }
        return Keys.hmacShaKeyFor(keyBytes);
    }

    public String generateAccessToken(UserPrincipal principal) {
        Instant now = Instant.now(clock);
        Instant expiresAt = now.plusSeconds(accessTokenExpirySeconds);

        JwtBuilder builder = Jwts.builder()
                .id(UUID.randomUUID().toString())
                .subject(principal.getUserId().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiresAt))
                .claim("email", principal.getEmail())
                .claim("fullName", principal.getFullName())
                .claim("role", principal.getRole().name());

        if (principal.getPatientId() != null) {
            builder.claim("patientId", principal.getPatientId().toString());
        }
        if (principal.getDoctorId() != null) {
            builder.claim("doctorId", principal.getDoctorId().toString());
        }
        return builder.signWith(signingKey, Jwts.SIG.HS256).compact();
    }

    public UserPrincipal parseAccessToken(String token) {
        if (token == null || token.isBlank()) {
            throw new UnauthorizedException(ErrorCode.UNAUTHORIZED, "Access token is missing");
        }
        try {
            Claims claims = Jwts.parser()
                    .clock(() -> Date.from(clock.instant()))
                    .verifyWith(signingKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();

            UUID userId = UUID.fromString(claims.getSubject());
            String email = claims.get("email", String.class);
            String fullName = claims.get("fullName", String.class);
            Role role = Role.valueOf(claims.get("role", String.class));
            UUID patientId = parseOptionalUuid(claims.get("patientId", String.class));
            UUID doctorId = parseOptionalUuid(claims.get("doctorId", String.class));

            return new UserPrincipal(userId, email, fullName, role, patientId, doctorId);
        } catch (ExpiredJwtException ex) {
            throw new UnauthorizedException(ErrorCode.TOKEN_EXPIRED, "Access token has expired");
        } catch (JwtException | IllegalArgumentException ex) {
            throw new UnauthorizedException(ErrorCode.UNAUTHORIZED, "Invalid access token");
        }
    }

    public long getAccessTokenExpirySeconds() {
        return accessTokenExpirySeconds;
    }

    private UUID parseOptionalUuid(String value) {
        return value != null && !value.isBlank() ? UUID.fromString(value) : null;
    }
}
