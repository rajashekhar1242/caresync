package com.caresync.audit.entity;

import com.caresync.auth.entity.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Append-only audit log entry persisted in {@code audit_logs}.
 * Stores user name and role at the time of the operation so renaming never rewrites history.
 */
@Entity
@Table(name = "audit_logs")
public class AuditLog {

    @Id
    private UUID id;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private Instant occurredAt;

    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "user_name", nullable = false, length = 100, updatable = false)
    private String userName;

    @Enumerated(EnumType.STRING)
    @Column(name = "user_role", nullable = false, length = 20, updatable = false)
    private Role userRole;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 40, updatable = false)
    private AuditAction action;

    @Enumerated(EnumType.STRING)
    @Column(name = "entity_type", nullable = false, length = 20, updatable = false)
    private AuditEntityType entityType;

    @Column(name = "entity_id", nullable = false, updatable = false)
    private UUID entityId;

    @Column(name = "patient_id", updatable = false)
    private UUID patientId;

    @Column(length = 500, updatable = false)
    private String details;

    @Column(name = "ip_address", length = 64, updatable = false)
    private String ipAddress;

    protected AuditLog() {
    }

    public AuditLog(
            UUID id,
            Instant occurredAt,
            UUID userId,
            String userName,
            Role userRole,
            AuditAction action,
            AuditEntityType entityType,
            UUID entityId,
            UUID patientId,
            String details,
            String ipAddress) {
        this.id = id;
        this.occurredAt = occurredAt;
        this.userId = userId;
        this.userName = userName;
        this.userRole = userRole;
        this.action = action;
        this.entityType = entityType;
        this.entityId = entityId;
        this.patientId = patientId;
        this.details = details;
        this.ipAddress = ipAddress;
    }

    public UUID getId() {
        return id;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getUserName() {
        return userName;
    }

    public Role getUserRole() {
        return userRole;
    }

    public AuditAction getAction() {
        return action;
    }

    public AuditEntityType getEntityType() {
        return entityType;
    }

    public UUID getEntityId() {
        return entityId;
    }

    public UUID getPatientId() {
        return patientId;
    }

    public String getDetails() {
        return details;
    }

    public String getIpAddress() {
        return ipAddress;
    }
}
