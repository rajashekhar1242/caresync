package com.caresync.auth.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.auth.dto.AuthResponse;
import com.caresync.auth.dto.LoginRequest;
import com.caresync.auth.dto.RefreshRequest;
import com.caresync.auth.dto.RegisterRequest;
import com.caresync.auth.dto.TokenResponse;
import com.caresync.auth.entity.RefreshToken;
import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.auth.repository.RefreshTokenRepository;
import com.caresync.auth.repository.UserRepository;
import com.caresync.common.config.CareSyncProperties;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.UnauthorizedException;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.SecurityEventLogger;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    private static final Instant FIXED_NOW = Instant.parse("2026-11-11T10:00:00Z");

    @Mock
    private UserRepository userRepository;

    @Mock
    private RefreshTokenRepository refreshTokenRepository;

    @Mock
    private ProfileLinkPort profileLinkPort;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(4);
    private final SecurityEventLogger securityEventLogger = new SecurityEventLogger();
    private AuthService authService;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(FIXED_NOW, ZoneOffset.UTC);
        CareSyncProperties props = new CareSyncProperties(
                new CareSyncProperties.Jwt(
                        "dGVzdC1vbmx5LWp3dC1zZWNyZXQta2V5LWF0LWxlYXN0LTMyLWJ5dGVzLWZvci10ZXN0cw==",
                        900,
                        604800),
                new CareSyncProperties.Cors(List.of("http://localhost:3000")),
                new CareSyncProperties.RateLimit(5, 10, 20, 30),
                new CareSyncProperties.Reporting("Asia/Kolkata"),
                null);
        JwtService jwtService = new JwtService(props, clock);
        RefreshTokenRevocationService revocationService = new RefreshTokenRevocationService(refreshTokenRepository);
        authService = new AuthService(
                userRepository,
                refreshTokenRepository,
                revocationService,
                profileLinkPort,
                passwordEncoder,
                jwtService,
                props,
                securityEventLogger,
                clock);
    }

    @Test
    void registersPatientNormalizingEmailAndStoresHashedRefreshToken() {
        UUID patientId = UUID.randomUUID();
        when(userRepository.existsByEmailIgnoreCase("alice@example.com")).thenReturn(false);
        when(userRepository.saveAndFlush(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        when(refreshTokenRepository.saveAndFlush(any(RefreshToken.class))).thenAnswer(inv -> inv.getArgument(0));
        when(profileLinkPort.createPatientProfile(any(), any(), any(), any())).thenReturn(patientId);

        AuthResponse response = authService.register(
                new RegisterRequest("Alice Smith", "  Alice@Example.com ", "Password123!", "+919876543210"),
                "127.0.0.1");

        assertThat(response.tokenType()).isEqualTo("Bearer");
        assertThat(response.expiresIn()).isEqualTo(900);
        assertThat(response.user().email()).isEqualTo("alice@example.com");
        assertThat(response.user().role()).isEqualTo(Role.PATIENT);
        assertThat(response.user().patientId()).isEqualTo(patientId);
        assertThat(response.user().doctorId()).isNull();

        ArgumentCaptor<RefreshToken> tokenCaptor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokenRepository).saveAndFlush(tokenCaptor.capture());
        assertThat(tokenCaptor.getValue().getTokenHash())
                .hasSize(64)
                .isNotEqualTo(response.refreshToken());
    }

    @Test
    void rejectsDuplicateEmailRegistration() {
        when(userRepository.existsByEmailIgnoreCase("dup@example.com")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(
                new RegisterRequest("Dup User", "dup@example.com", "Password123!", null),
                "127.0.0.1"))
                .isInstanceOf(ConflictException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);

        verify(userRepository, never()).saveAndFlush(any());
    }

    @Test
    void translatesConcurrentUniqueEmailConstraintViolationToConflictException() {
        SQLException sqlEx = new SQLException(
                "ERROR: duplicate key value violates unique constraint \"uq_users_email_lower\"",
                "23505");
        ConstraintViolationException hibernateEx = new ConstraintViolationException(
                "could not execute statement",
                sqlEx,
                "uq_users_email_lower");
        when(userRepository.existsByEmailIgnoreCase("race@example.com")).thenReturn(false);
        when(userRepository.saveAndFlush(any(User.class)))
                .thenThrow(new DataIntegrityViolationException("could not execute statement", hibernateEx));

        assertThatThrownBy(() -> authService.register(
                new RegisterRequest("Race User", "Race@Example.com", "Password123!", null),
                "127.0.0.1"))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> {
                    ConflictException ce = (ConflictException) ex;
                    assertThat(ce.getErrorCode()).isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);
                    assertThat(ce.getMessage()).doesNotContain("uq_users_email_lower", "23505", "duplicate key", "SQL");
                });

        verify(profileLinkPort, never()).createPatientProfile(any(), any(), any(), any());
        verify(refreshTokenRepository, never()).saveAndFlush(any());
    }

    @Test
    void translatesSqlState23505OnEmailConstraintWithoutHibernateConstraintNameToConflictException() {
        SQLException sqlEx = new SQLException(
                "ERROR: duplicate key value violates unique constraint \"uq_users_email_lower\"",
                "23505");
        ConstraintViolationException hibernateEx = new ConstraintViolationException(
                "could not execute statement",
                sqlEx,
                null);
        when(userRepository.existsByEmailIgnoreCase("race2@example.com")).thenReturn(false);
        when(userRepository.saveAndFlush(any(User.class)))
                .thenThrow(new DataIntegrityViolationException("could not execute statement", hibernateEx));

        assertThatThrownBy(() -> authService.register(
                new RegisterRequest("Race Two", "Race2@Example.com", "Password123!", null),
                "127.0.0.1"))
                .isInstanceOf(ConflictException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS);

        verify(profileLinkPort, never()).createPatientProfile(any(), any(), any(), any());
        verify(refreshTokenRepository, never()).saveAndFlush(any());
    }

    @Test
    void rethrowsUnrelatedDataIntegrityViolationWithoutMaskingAsEmailConflict() {
        SQLException sqlEx = new SQLException(
                "ERROR: duplicate key value violates unique constraint \"users_pkey\"",
                "23505");
        ConstraintViolationException hibernateEx = new ConstraintViolationException(
                "could not execute statement",
                sqlEx,
                "users_pkey");
        DataIntegrityViolationException expected = new DataIntegrityViolationException(
                "could not execute statement",
                hibernateEx);
        when(userRepository.existsByEmailIgnoreCase("other@example.com")).thenReturn(false);
        when(userRepository.saveAndFlush(any(User.class))).thenThrow(expected);

        assertThatThrownBy(() -> authService.register(
                new RegisterRequest("Other User", "other@example.com", "Password123!", null),
                "127.0.0.1"))
                .isSameAs(expected);

        verify(profileLinkPort, never()).createPatientProfile(any(), any(), any(), any());
        verify(refreshTokenRepository, never()).saveAndFlush(any());
    }

    @Test
    void rethrowsGenericDataIntegrityViolationWithoutEmailConstraintEvidence() {
        DataIntegrityViolationException expected = new DataIntegrityViolationException(
                "value too long for type character varying(100)",
                new SQLException("value too long for type character varying(100)", "22001"));
        when(userRepository.existsByEmailIgnoreCase("longname@example.com")).thenReturn(false);
        when(userRepository.saveAndFlush(any(User.class))).thenThrow(expected);

        assertThatThrownBy(() -> authService.register(
                new RegisterRequest("Long Name User", "longname@example.com", "Password123!", null),
                "127.0.0.1"))
                .isSameAs(expected);

        verify(profileLinkPort, never()).createPatientProfile(any(), any(), any(), any());
        verify(refreshTokenRepository, never()).saveAndFlush(any());
    }

    @Test
    void rejectsLockedSentinelAccountOnLogin() {
        User lockedAdmin = new User(
                UUID.randomUUID(),
                "admin@caresync.local",
                "!LOCKED_REQUIRES_BOOTSTRAP!",
                "System Administrator",
                Role.ADMIN,
                FIXED_NOW);
        when(userRepository.findByEmailIgnoreCase("admin@caresync.local")).thenReturn(Optional.of(lockedAdmin));

        assertThatThrownBy(() -> authService.login(
                new LoginRequest("admin@caresync.local", "!LOCKED_REQUIRES_BOOTSTRAP!"),
                "127.0.0.1"))
                .isInstanceOf(UnauthorizedException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_CREDENTIALS);
    }

    @Test
    void rotatesRefreshTokenAndRejectsReuse() {
        UUID userId = UUID.randomUUID();
        UUID oldId = UUID.randomUUID();
        String rawOld = "old-raw-refresh-token-value";
        String oldHash = AuthService.sha256Hex(rawOld);
        RefreshToken existing = new RefreshToken(oldId, userId, oldHash, FIXED_NOW.plusSeconds(3600), FIXED_NOW);
        User user = new User(userId, "doc@caresync.local", "hash", "Dr. Rao", Role.DOCTOR, FIXED_NOW);

        when(refreshTokenRepository.findByTokenHashForUpdate(oldHash)).thenReturn(Optional.of(existing));
        when(userRepository.findById(userId)).thenReturn(Optional.of(user));
        when(refreshTokenRepository.saveAndFlush(any(RefreshToken.class))).thenAnswer(inv -> inv.getArgument(0));
        when(refreshTokenRepository.revokeAndReplaceIfActive(any(), any(), any())).thenReturn(1);
        when(profileLinkPort.findDoctorIdByUserId(userId)).thenReturn(Optional.of(UUID.randomUUID()));

        TokenResponse rotated = authService.refresh(new RefreshRequest(rawOld), "127.0.0.1");
        assertThat(rotated.accessToken()).isNotBlank();
        assertThat(rotated.refreshToken()).isNotBlank().isNotEqualTo(rawOld);

        // Concurrent reuse check: atomic update returns 0 -> revokes all active tokens for user
        when(refreshTokenRepository.revokeAndReplaceIfActive(any(), any(), any())).thenReturn(0);
        assertThatThrownBy(() -> authService.refresh(new RefreshRequest(rawOld), "127.0.0.1"))
                .isInstanceOf(UnauthorizedException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REFRESH_TOKEN);
        verify(refreshTokenRepository).revokeAllActiveByUserId(userId, FIXED_NOW);
    }

    @Test
    void refreshReplayOfRevokedTokenRevokesActiveTokensButExpiredTokenDoesNot() {
        UUID userId = UUID.randomUUID();
        String rawRevoked = "already-revoked-token";
        String revokedHash = AuthService.sha256Hex(rawRevoked);
        RefreshToken alreadyRevoked = new RefreshToken(
                UUID.randomUUID(), userId, revokedHash, FIXED_NOW.plusSeconds(3600), FIXED_NOW.minusSeconds(60));
        alreadyRevoked.setRevokedAt(FIXED_NOW.minusSeconds(10));
        when(refreshTokenRepository.findByTokenHashForUpdate(revokedHash)).thenReturn(Optional.of(alreadyRevoked));
        when(refreshTokenRepository.revokeAllActiveByUserId(userId, FIXED_NOW)).thenReturn(1);

        assertThatThrownBy(() -> authService.refresh(new RefreshRequest(rawRevoked), "127.0.0.1"))
                .isInstanceOf(UnauthorizedException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REFRESH_TOKEN);
        verify(refreshTokenRepository).revokeAllActiveByUserId(userId, FIXED_NOW);

        // Naturally expired token should be rejected WITHOUT revoking other sessions
        String rawExpired = "naturally-expired-token";
        String expiredHash = AuthService.sha256Hex(rawExpired);
        RefreshToken expired = new RefreshToken(
                UUID.randomUUID(), userId, expiredHash, FIXED_NOW.minusSeconds(1), FIXED_NOW.minusSeconds(3600));
        when(refreshTokenRepository.findByTokenHashForUpdate(expiredHash)).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> authService.refresh(new RefreshRequest(rawExpired), "127.0.0.1"))
                .isInstanceOf(UnauthorizedException.class)
                .extracting("errorCode")
                .isEqualTo(ErrorCode.INVALID_REFRESH_TOKEN);
        verify(refreshTokenRepository).revokeAllActiveByUserId(userId, FIXED_NOW);
    }

    @Test
    void logoutIsIdempotentOnUnknownTokens() {
        when(refreshTokenRepository.findByTokenHash(any())).thenReturn(Optional.empty());
        when(refreshTokenRepository.revokeByTokenHashIfActive(any(), any())).thenReturn(0);

        authService.logout(new RefreshRequest("unknown-token"), "127.0.0.1");

        verify(refreshTokenRepository).revokeByTokenHashIfActive(any(), any());
    }
}
