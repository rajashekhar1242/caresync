package com.caresync.audit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.audit.dto.AuditLogResponse;
import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.entity.AuditEntityType;
import com.caresync.audit.entity.AuditLog;
import com.caresync.audit.repository.AuditLogRepository;
import com.caresync.auth.entity.Role;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;

@ExtendWith(MockitoExtension.class)
class AuditServiceTest {

    private static final Instant FIXED_NOW = Instant.parse("2026-11-12T10:00:00Z");

    @Mock
    private AuditLogRepository auditLogRepository;

    private AuditService auditService;

    @BeforeEach
    void setUp() {
        auditService = new AuditService(auditLogRepository, Clock.fixed(FIXED_NOW, ZoneOffset.UTC));
    }

    @Test
    void recordStoresActorSnapshotAndTruncatesLongFields() {
        when(auditLogRepository.save(any(AuditLog.class))).thenAnswer(inv -> inv.getArgument(0));

        UUID userId = UUID.randomUUID();
        UUID entityId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();
        String oversizedDetails = "x".repeat(600);
        UserPrincipal actor = new UserPrincipal(
                userId, "doc@caresync.local", "Dr. Strange", Role.DOCTOR, null, UUID.randomUUID());

        AuditLog saved = auditService.record(
                actor, AuditAction.PAYMENT_RECORDED, entityId, patientId, oversizedDetails, "   ");

        ArgumentCaptor<AuditLog> captor = ArgumentCaptor.forClass(AuditLog.class);
        verify(auditLogRepository).save(captor.capture());

        AuditLog captured = captor.getValue();
        assertThat(saved.getId()).isNotNull();
        assertThat(captured.getOccurredAt()).isEqualTo(FIXED_NOW);
        assertThat(captured.getUserId()).isEqualTo(userId);
        assertThat(captured.getUserName()).isEqualTo("Dr. Strange");
        assertThat(captured.getUserRole()).isEqualTo(Role.DOCTOR);
        assertThat(captured.getAction()).isEqualTo(AuditAction.PAYMENT_RECORDED);
        assertThat(captured.getEntityType()).isEqualTo(AuditEntityType.INVOICE);
        assertThat(captured.getEntityId()).isEqualTo(entityId);
        assertThat(captured.getPatientId()).isEqualTo(patientId);
        assertThat(captured.getDetails()).hasSize(500);
        assertThat(captured.getIpAddress()).isNull();
    }

    @Test
    void listAuditLogsRejectsFromNotBeforeTo() {
        Instant t = Instant.parse("2026-11-12T12:00:00Z");

        assertThatThrownBy(() -> auditService.listAuditLogs(null, null, null, t, t, 0, 20))
                .isInstanceOf(ValidationException.class)
                .satisfies(ex -> assertThat(((ValidationException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.VALIDATION_FAILED));

        assertThatThrownBy(() -> auditService.listAuditLogs(
                null, null, null, t.plusSeconds(10), t, 0, 20))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void listAuditLogsQueriesNewestFirstAndMapsPageResponse() {
        AuditLog entry = new AuditLog(
                UUID.randomUUID(),
                FIXED_NOW,
                UUID.randomUUID(),
                "Admin User",
                Role.ADMIN,
                AuditAction.PATIENT_READ,
                AuditEntityType.PATIENT,
                UUID.randomUUID(),
                UUID.randomUUID(),
                "Viewed patient record",
                "10.0.0.1");
        when(auditLogRepository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(entry)));

        PageResponse<AuditLogResponse> result = auditService.listAuditLogs(
                entry.getUserId(),
                AuditAction.PATIENT_READ,
                AuditEntityType.PATIENT,
                FIXED_NOW.minusSeconds(60),
                FIXED_NOW.plusSeconds(60),
                0,
                20);

        assertThat(result.content()).hasSize(1);
        assertThat(result.content().getFirst().action()).isEqualTo(AuditAction.PATIENT_READ);
        assertThat(result.totalElements()).isEqualTo(1);

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(auditLogRepository).findAll(any(Specification.class), pageableCaptor.capture());
        Pageable pageable = pageableCaptor.getValue();
        assertThat(pageable.getPageNumber()).isZero();
        assertThat(pageable.getPageSize()).isEqualTo(20);
        assertThat(pageable.getSort().getOrderFor("occurredAt")).isNotNull();
        assertThat(pageable.getSort().getOrderFor("occurredAt").getDirection()).isEqualTo(Sort.Direction.DESC);
    }
}
