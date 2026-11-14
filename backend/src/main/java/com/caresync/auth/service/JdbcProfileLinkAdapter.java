package com.caresync.auth.service;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * JDBC implementation of {@link ProfileLinkPort} querying/creating profile links in PostgreSQL.
 */
@Component
public class JdbcProfileLinkAdapter implements ProfileLinkPort {

    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public JdbcProfileLinkAdapter(JdbcTemplate jdbcTemplate, Clock clock) {
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    @Override
    public UUID createPatientProfile(UUID userId, String fullName, String email, String phone) {
        UUID patientId = UUID.randomUUID();
        Timestamp now = Timestamp.from(Instant.now(clock));
        jdbcTemplate.update(
                "INSERT INTO patients (id, user_id, full_name, phone, email, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?)",
                patientId, userId, fullName, phone, email, now, now);
        return patientId;
    }

    @Override
    public Optional<UUID> findPatientIdByUserId(UUID userId) {
        List<UUID> ids = jdbcTemplate.query(
                "SELECT id FROM patients WHERE user_id = ?",
                (rs, rowNum) -> rs.getObject("id", UUID.class),
                userId);
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.getFirst());
    }

    @Override
    public Optional<UUID> findDoctorIdByUserId(UUID userId) {
        List<UUID> ids = jdbcTemplate.query(
                "SELECT id FROM doctors WHERE user_id = ?",
                (rs, rowNum) -> rs.getObject("id", UUID.class),
                userId);
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.getFirst());
    }
}
