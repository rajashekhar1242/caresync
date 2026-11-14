package com.caresync.auth.repository;

import com.caresync.auth.entity.RefreshToken;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {

    Optional<RefreshToken> findByTokenHash(String tokenHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT rt FROM RefreshToken rt WHERE rt.tokenHash = :tokenHash")
    Optional<RefreshToken> findByTokenHashForUpdate(@Param("tokenHash") String tokenHash);

    @Modifying
    @Query("UPDATE RefreshToken rt SET rt.revokedAt = :revokedAt, rt.replacedById = :replacedById "
            + "WHERE rt.id = :id AND rt.revokedAt IS NULL")
    int revokeAndReplaceIfActive(
            @Param("id") UUID id,
            @Param("revokedAt") Instant revokedAt,
            @Param("replacedById") UUID replacedById);

    @Modifying
    @Query("UPDATE RefreshToken rt SET rt.revokedAt = :revokedAt "
            + "WHERE rt.tokenHash = :tokenHash AND rt.revokedAt IS NULL")
    int revokeByTokenHashIfActive(
            @Param("tokenHash") String tokenHash,
            @Param("revokedAt") Instant revokedAt);

    @Modifying
    @Query("UPDATE RefreshToken rt SET rt.revokedAt = :revokedAt "
            + "WHERE rt.userId = :userId AND rt.revokedAt IS NULL")
    int revokeAllActiveByUserId(
            @Param("userId") UUID userId,
            @Param("revokedAt") Instant revokedAt);
}
