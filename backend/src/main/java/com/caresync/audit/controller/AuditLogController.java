package com.caresync.audit.controller;

import com.caresync.audit.dto.AuditLogResponse;
import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.entity.AuditEntityType;
import com.caresync.audit.service.AuditService;
import com.caresync.common.dto.PageResponse;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.Instant;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin-only read endpoint for the append-only audit trail.
 */
@RestController
@RequestMapping("/api/audit-logs")
@Validated
public class AuditLogController {

    private final AuditService auditService;

    public AuditLogController(AuditService auditService) {
        this.auditService = auditService;
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public PageResponse<AuditLogResponse> listAuditLogs(
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) AuditAction action,
            @RequestParam(required = false) AuditEntityType entityType,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return auditService.listAuditLogs(userId, action, entityType, from, to, page, size);
    }
}
