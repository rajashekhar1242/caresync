package com.caresync.audit.service;

import com.caresync.audit.dto.AuditLogResponse;
import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.entity.AuditEntityType;
import com.caresync.audit.entity.AuditLog;
import com.caresync.audit.repository.AuditLogRepository;
import com.caresync.auth.entity.Role;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.SecurityUtils;
import com.caresync.common.security.UserPrincipal;
import com.caresync.common.util.RequestIpUtils;
import jakarta.persistence.criteria.Predicate;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Transactional append-only audit service and filtered query service.
 * Writes participate in the caller's active transaction so operations and audit entries commit atomically.
 */
@Service
public class AuditService {

    private static final int MAX_USER_NAME_LENGTH = 100;
    private static final int MAX_DETAILS_LENGTH = 500;
    private static final int MAX_IP_LENGTH = 64;

    private final AuditLogRepository auditLogRepository;
    private final Clock clock;

    public AuditService(AuditLogRepository auditLogRepository, Clock clock) {
        this.auditLogRepository = auditLogRepository;
        this.clock = clock;
    }

    /**
     * Records an audit entry for the authenticated principal in the current servlet request, if any.
     */
    @Transactional
    public AuditLog recordCurrentUser(
            AuditAction action,
            UUID entityId,
            UUID patientId,
            String details) {
        UserPrincipal principal = SecurityUtils.requireCurrentPrincipal();
        return record(
                principal,
                action,
                entityId,
                patientId,
                details,
                RequestIpUtils.extractCurrentClientIp());
    }

    /**
     * Records an audit entry for an explicit {@link UserPrincipal}.
     */
    @Transactional
    public AuditLog record(
            UserPrincipal actor,
            AuditAction action,
            UUID entityId,
            UUID patientId,
            String details,
            String ipAddress) {
        Objects.requireNonNull(actor, "actor is required");
        return record(
                actor.getUserId(),
                actor.getFullName(),
                actor.getRole(),
                action,
                entityId,
                patientId,
                details,
                ipAddress);
    }

    /**
     * Records an audit entry using explicit actor snapshot metadata in the current transaction.
     */
    @Transactional
    public AuditLog record(
            UUID userId,
            String userName,
            Role userRole,
            AuditAction action,
            UUID entityId,
            UUID patientId,
            String details,
            String ipAddress) {
        Objects.requireNonNull(userId, "userId is required");
        Objects.requireNonNull(userName, "userName is required");
        Objects.requireNonNull(userRole, "userRole is required");
        Objects.requireNonNull(action, "action is required");
        Objects.requireNonNull(entityId, "entityId is required");

        AuditLog entry = new AuditLog(
                UUID.randomUUID(),
                Instant.now(clock),
                userId,
                truncate(userName.trim(), MAX_USER_NAME_LENGTH),
                userRole,
                action,
                action.getEntityType(),
                entityId,
                patientId,
                normalizeOptional(details, MAX_DETAILS_LENGTH),
                normalizeOptional(ipAddress, MAX_IP_LENGTH));
        return auditLogRepository.save(entry);
    }

    /**
     * Returns filtered audit entries ordered newest-first. Never writes an audit entry itself.
     */
    @Transactional(readOnly = true)
    public PageResponse<AuditLogResponse> listAuditLogs(
            UUID userId,
            AuditAction action,
            AuditEntityType entityType,
            Instant from,
            Instant to,
            int page,
            int size) {
        if (from != null && to != null && !from.isBefore(to)) {
            throw new ValidationException("from", "must be before to");
        }

        Specification<AuditLog> spec = buildSpecification(userId, action, entityType, from, to);
        PageRequest pageable = PageRequest.of(
                page,
                size,
                Sort.by(Sort.Order.desc("occurredAt"), Sort.Order.desc("id")));
        Page<AuditLogResponse> results = auditLogRepository.findAll(spec, pageable)
                .map(AuditLogResponse::from);
        return PageResponse.from(results);
    }

    private Specification<AuditLog> buildSpecification(
            UUID userId,
            AuditAction action,
            AuditEntityType entityType,
            Instant from,
            Instant to) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (userId != null) {
                predicates.add(cb.equal(root.get("userId"), userId));
            }
            if (action != null) {
                predicates.add(cb.equal(root.get("action"), action));
            }
            if (entityType != null) {
                predicates.add(cb.equal(root.get("entityType"), entityType));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("occurredAt"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThan(root.get("occurredAt"), to));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private String truncate(String value, int maxLength) {
        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }

    private String normalizeOptional(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String trimmed = value.trim();
        return truncate(trimmed, maxLength);
    }
}
