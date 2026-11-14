package com.caresync.audit.dto;

import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.entity.AuditEntityType;
import com.caresync.audit.entity.AuditLog;
import com.caresync.auth.entity.Role;
import java.time.Instant;
import java.util.UUID;

public record AuditLogResponse(
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
        String ipAddress
) {
    public static AuditLogResponse from(AuditLog entry) {
        return new AuditLogResponse(
                entry.getId(),
                entry.getOccurredAt(),
                entry.getUserId(),
                entry.getUserName(),
                entry.getUserRole(),
                entry.getAction(),
                entry.getEntityType(),
                entry.getEntityId(),
                entry.getPatientId(),
                entry.getDetails(),
                entry.getIpAddress());
    }
}
