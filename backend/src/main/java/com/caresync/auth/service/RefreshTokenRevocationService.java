package com.caresync.auth.service;

import com.caresync.auth.repository.RefreshTokenRepository;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Revokes all active refresh tokens for a user.
 * Executes within the caller's transaction context to prevent connection pool exhaustion.
 */
@Service
public class RefreshTokenRevocationService {

    private final RefreshTokenRepository refreshTokenRepository;

    public RefreshTokenRevocationService(RefreshTokenRepository refreshTokenRepository) {
        this.refreshTokenRepository = refreshTokenRepository;
    }

    @Transactional
    public int revokeAllActiveTokensForUser(UUID userId, Instant revokedAt) {
        return refreshTokenRepository.revokeAllActiveByUserId(userId, revokedAt);
    }
}
