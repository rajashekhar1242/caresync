package com.caresync.auth.service;

import com.caresync.auth.dto.AuthResponse;
import com.caresync.auth.dto.LoginRequest;
import com.caresync.auth.dto.RefreshRequest;
import com.caresync.auth.dto.RegisterRequest;
import com.caresync.auth.dto.TokenResponse;
import com.caresync.auth.dto.UserResponse;
import com.caresync.auth.entity.RefreshToken;
import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.auth.repository.RefreshTokenRepository;
import com.caresync.auth.repository.UserRepository;
import com.caresync.common.config.CareSyncProperties;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.UnauthorizedException;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.SecurityEventLogger;
import com.caresync.common.security.UserPrincipal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Collections;
import java.util.HexFormat;
import java.util.IdentityHashMap;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Handles patient registration, authentication, single-use refresh token rotation, logout, and current-user lookup.
 */
@Service
public class AuthService {

    private static final String EMAIL_UNIQUE_CONSTRAINT = "uq_users_email_lower";
    private static final String POSTGRES_UNIQUE_VIOLATION_SQL_STATE = "23505";

    private static final String TOKEN_TYPE_BEARER = "Bearer";
    private static final int REFRESH_TOKEN_BYTES = 32;

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final RefreshTokenRevocationService refreshTokenRevocationService;
    private final ProfileLinkPort profileLinkPort;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final CareSyncProperties properties;
    private final SecurityEventLogger securityEventLogger;
    private final Clock clock;
    private final SecureRandom secureRandom = new SecureRandom();

    public AuthService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            RefreshTokenRevocationService refreshTokenRevocationService,
            ProfileLinkPort profileLinkPort,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            CareSyncProperties properties,
            SecurityEventLogger securityEventLogger,
            Clock clock) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.refreshTokenRevocationService = refreshTokenRevocationService;
        this.profileLinkPort = profileLinkPort;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.properties = properties;
        this.securityEventLogger = securityEventLogger;
        this.clock = clock;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request, String clientIp) {
        String normalizedEmail = request.email().trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new ConflictException(ErrorCode.EMAIL_ALREADY_EXISTS, "An account with this email already exists");
        }

        String fullName = request.fullName().trim();
        String phone = request.phone() != null && !request.phone().isBlank() ? request.phone().trim() : null;
        Instant now = Instant.now(clock);

        User user = new User(
                UUID.randomUUID(),
                normalizedEmail,
                passwordEncoder.encode(request.password()),
                fullName,
                Role.PATIENT,
                now);
        try {
            userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException ex) {
            if (isEmailUniquenessViolation(ex)) {
                throw new ConflictException(ErrorCode.EMAIL_ALREADY_EXISTS, "An account with this email already exists");
            }
            throw ex;
        }

        UUID patientId = profileLinkPort.createPatientProfile(user.getId(), fullName, normalizedEmail, phone);
        UserPrincipal principal = new UserPrincipal(
                user.getId(), user.getEmail(), user.getFullName(), user.getRole(), patientId, null);

        String accessToken = jwtService.generateAccessToken(principal);
        String rawRefreshToken = issueRefreshToken(user.getId(), now).rawToken();

        securityEventLogger.registerSucceeded(user.getId(), user.getRole().name(), clientIp);
        return new AuthResponse(
                accessToken,
                rawRefreshToken,
                TOKEN_TYPE_BEARER,
                jwtService.getAccessTokenExpirySeconds(),
                toUserResponse(user, patientId, null));
    }

    @Transactional
    public AuthResponse login(LoginRequest request, String clientIp) {
        String normalizedEmail = request.email().trim().toLowerCase(Locale.ROOT);
        Optional<User> userOpt = userRepository.findByEmailIgnoreCase(normalizedEmail);
        if (userOpt.isEmpty()) {
            securityEventLogger.loginFailed("USER_NOT_FOUND", clientIp);
            throw new UnauthorizedException(ErrorCode.INVALID_CREDENTIALS, "Invalid email or password");
        }

        User user = userOpt.get();
        if (!isBcryptHash(user.getPasswordHash())
                || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            securityEventLogger.loginFailed("BAD_PASSWORD", clientIp);
            throw new UnauthorizedException(ErrorCode.INVALID_CREDENTIALS, "Invalid email or password");
        }

        ProfileLinks links = resolveProfileLinks(user);
        UserPrincipal principal = new UserPrincipal(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole(),
                links.patientId(),
                links.doctorId());

        Instant now = Instant.now(clock);
        String accessToken = jwtService.generateAccessToken(principal);
        String rawRefreshToken = issueRefreshToken(user.getId(), now).rawToken();

        securityEventLogger.loginSucceeded(user.getId(), user.getRole().name(), clientIp);
        return new AuthResponse(
                accessToken,
                rawRefreshToken,
                TOKEN_TYPE_BEARER,
                jwtService.getAccessTokenExpirySeconds(),
                toUserResponse(user, links.patientId(), links.doctorId()));
    }

    @Transactional(noRollbackFor = UnauthorizedException.class)
    public TokenResponse refresh(RefreshRequest request, String clientIp) {
        String tokenHash = sha256Hex(request.refreshToken().trim());
        RefreshToken existing = refreshTokenRepository.findByTokenHashForUpdate(tokenHash)
                .orElseThrow(() -> {
                    securityEventLogger.refreshRejected("TOKEN_NOT_FOUND", null, clientIp);
                    return new UnauthorizedException(
                            ErrorCode.INVALID_REFRESH_TOKEN,
                            "Refresh token is invalid or has already been used");
                });

        Instant now = Instant.now(clock);
        if (existing.getRevokedAt() != null || !existing.getExpiresAt().isAfter(now)) {
            if (existing.getRevokedAt() != null) {
                int revokedCount = refreshTokenRevocationService.revokeAllActiveTokensForUser(
                        existing.getUserId(), now);
                securityEventLogger.refreshReplayDetected(existing.getUserId(), revokedCount, clientIp);
            }
            String reason = existing.getRevokedAt() != null ? "TOKEN_REUSED_OR_REVOKED" : "TOKEN_EXPIRED";
            securityEventLogger.refreshRejected(reason, existing.getUserId(), clientIp);
            throw new UnauthorizedException(
                    ErrorCode.INVALID_REFRESH_TOKEN,
                    "Refresh token is invalid, expired, or revoked");
        }

        User user = userRepository.findById(existing.getUserId())
                .orElseThrow(() -> new UnauthorizedException(
                        ErrorCode.INVALID_REFRESH_TOKEN,
                        "Associated user no longer exists"));

        IssuedRefreshToken replacement = issueRefreshToken(user.getId(), now);
        int updated = refreshTokenRepository.revokeAndReplaceIfActive(
                existing.getId(), now, replacement.entity().getId());
        if (updated == 0) {
            int revokedCount = refreshTokenRevocationService.revokeAllActiveTokensForUser(user.getId(), now);
            securityEventLogger.refreshReplayDetected(user.getId(), revokedCount, clientIp);
            securityEventLogger.refreshRejected("CONCURRENT_REUSE", user.getId(), clientIp);
            throw new UnauthorizedException(
                    ErrorCode.INVALID_REFRESH_TOKEN,
                    "Refresh token has already been rotated or revoked");
        }

        ProfileLinks links = resolveProfileLinks(user);
        UserPrincipal principal = new UserPrincipal(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole(),
                links.patientId(),
                links.doctorId());

        String accessToken = jwtService.generateAccessToken(principal);
        securityEventLogger.tokenRefreshed(user.getId(), clientIp);
        return new TokenResponse(
                accessToken,
                replacement.rawToken(),
                TOKEN_TYPE_BEARER,
                jwtService.getAccessTokenExpirySeconds());
    }

    @Transactional
    public void logout(RefreshRequest request, String clientIp) {
        String tokenHash = sha256Hex(request.refreshToken().trim());
        Optional<RefreshToken> existing = refreshTokenRepository.findByTokenHash(tokenHash);
        refreshTokenRepository.revokeByTokenHashIfActive(tokenHash, Instant.now(clock));
        securityEventLogger.logoutCompleted(existing.map(RefreshToken::getUserId).orElse(null), clientIp);
    }

    @Transactional(readOnly = true)
    public UserResponse getCurrentUser(UserPrincipal principal) {
        User user = userRepository.findById(principal.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        ProfileLinks links = resolveProfileLinks(user);
        return toUserResponse(user, links.patientId(), links.doctorId());
    }

    private IssuedRefreshToken issueRefreshToken(UUID userId, Instant now) {
        byte[] randomBytes = new byte[REFRESH_TOKEN_BYTES];
        secureRandom.nextBytes(randomBytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
        String tokenHash = sha256Hex(rawToken);
        long refreshExpirySeconds = properties.jwt() != null && properties.jwt().refreshTokenExpirySeconds() > 0
                ? properties.jwt().refreshTokenExpirySeconds()
                : 604_800L;

        RefreshToken entity = new RefreshToken(
                UUID.randomUUID(),
                userId,
                tokenHash,
                now.plusSeconds(refreshExpirySeconds),
                now);
        refreshTokenRepository.saveAndFlush(entity);
        return new IssuedRefreshToken(rawToken, entity);
    }

    private ProfileLinks resolveProfileLinks(User user) {
        UUID patientId = user.getRole() == Role.PATIENT
                ? profileLinkPort.findPatientIdByUserId(user.getId()).orElse(null)
                : null;
        UUID doctorId = user.getRole() == Role.DOCTOR
                ? profileLinkPort.findDoctorIdByUserId(user.getId()).orElse(null)
                : null;
        return new ProfileLinks(patientId, doctorId);
    }

    private UserResponse toUserResponse(User user, UUID patientId, UUID doctorId) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getFullName(),
                user.getRole(),
                patientId,
                doctorId);
    }

    private boolean isEmailUniquenessViolation(DataIntegrityViolationException ex) {
        Set<Throwable> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        Throwable current = ex;
        while (current != null && visited.add(current)) {
            if (current instanceof ConstraintViolationException cve) {
                String constraintName = cve.getConstraintName();
                if (constraintName != null) {
                    return EMAIL_UNIQUE_CONSTRAINT.equalsIgnoreCase(constraintName);
                }
                if (isEmailUniqueSqlException(cve.getSQLException())) {
                    return true;
                }
            }
            if (current instanceof SQLException sqlEx && isEmailUniqueSqlException(sqlEx)) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private boolean isEmailUniqueSqlException(SQLException sqlException) {
        SQLException current = sqlException;
        while (current != null) {
            if (POSTGRES_UNIQUE_VIOLATION_SQL_STATE.equals(current.getSQLState())
                    && current.getMessage() != null
                    && current.getMessage().toLowerCase(Locale.ROOT).contains(EMAIL_UNIQUE_CONSTRAINT)) {
                return true;
            }
            current = current.getNextException();
        }
        return false;
    }

    private boolean isBcryptHash(String hash) {
        return hash != null && hash.startsWith("$2");
    }

    static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] encoded = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(encoded);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 algorithm unavailable", ex);
        }
    }

    private record ProfileLinks(UUID patientId, UUID doctorId) {
    }

    private record IssuedRefreshToken(String rawToken, RefreshToken entity) {
    }
}
