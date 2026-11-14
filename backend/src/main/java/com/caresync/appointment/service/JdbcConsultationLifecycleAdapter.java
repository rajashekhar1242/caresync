package com.caresync.appointment.service;

import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.service.AuditService;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * JDBC implementation of {@link ConsultationLifecyclePort} verifying consultation completeness
 * and finalizing it inside the appointment completion transaction.
 */
public class JdbcConsultationLifecycleAdapter implements ConsultationLifecyclePort {

    private final JdbcTemplate jdbcTemplate;
    private final AuditService auditService;

    public JdbcConsultationLifecycleAdapter(JdbcTemplate jdbcTemplate, AuditService auditService) {
        this.jdbcTemplate = jdbcTemplate;
        this.auditService = auditService;
    }

    @Override
    public void verifyReadyAndFinalize(UUID appointmentId, Instant finalizedAt) {
        List<ConsultationRow> rows = jdbcTemplate.query(
                "SELECT id, patient_id, diagnosis FROM consultations WHERE appointment_id = ?",
                (rs, rowNum) -> new ConsultationRow(
                        rs.getObject("id", UUID.class),
                        rs.getObject("patient_id", UUID.class),
                        rs.getString("diagnosis")),
                appointmentId);
        if (rows.isEmpty()) {
            throw new ConflictException(
                    ErrorCode.CONSULTATION_INCOMPLETE,
                    "Appointment cannot be completed without a consultation");
        }
        ConsultationRow consultation = rows.getFirst();
        if (consultation.diagnosis() == null || consultation.diagnosis().trim().isEmpty()) {
            throw new ConflictException(
                    ErrorCode.CONSULTATION_INCOMPLETE,
                    "Appointment cannot be completed until consultation diagnosis is recorded");
        }

        Timestamp ts = Timestamp.from(finalizedAt);
        jdbcTemplate.update(
                "UPDATE consultations SET finalized_at = COALESCE(finalized_at, ?), updated_at = ? WHERE id = ?",
                ts,
                ts,
                consultation.id());

        auditService.recordCurrentUser(
                AuditAction.CONSULTATION_FINALIZED,
                consultation.id(),
                consultation.patientId(),
                "Consultation finalized on appointment completion");
    }

    private record ConsultationRow(UUID id, UUID patientId, String diagnosis) {
    }
}
