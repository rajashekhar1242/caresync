package com.caresync.consultation.service;

import com.caresync.appointment.service.ConsultationLifecyclePort;
import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.service.AuditService;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.consultation.entity.Consultation;
import com.caresync.consultation.repository.ConsultationRepository;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * JPA implementation of {@link ConsultationLifecyclePort} verifying consultation completeness
 * and finalizing it inside the appointment completion transaction.
 */
@Service
public class ConsultationLifecycleAdapter implements ConsultationLifecyclePort {

    private final ConsultationRepository consultationRepository;
    private final AuditService auditService;

    public ConsultationLifecycleAdapter(
            ConsultationRepository consultationRepository,
            AuditService auditService) {
        this.consultationRepository = consultationRepository;
        this.auditService = auditService;
    }

    @Override
    @Transactional
    public void verifyReadyAndFinalize(UUID appointmentId, Instant finalizedAt) {
        Consultation consultation = consultationRepository.findWithDetailsByAppointmentId(appointmentId)
                .orElseThrow(() -> new ConflictException(
                        ErrorCode.CONSULTATION_INCOMPLETE,
                        "Appointment cannot be completed without a consultation"));

        if (consultation.getDiagnosis() == null || consultation.getDiagnosis().trim().isEmpty()) {
            throw new ConflictException(
                    ErrorCode.CONSULTATION_INCOMPLETE,
                    "Appointment cannot be completed until consultation diagnosis is recorded");
        }

        consultation.finalizeAt(finalizedAt, finalizedAt);
        consultationRepository.saveAndFlush(consultation);

        auditService.recordCurrentUser(
                AuditAction.CONSULTATION_FINALIZED,
                consultation.getId(),
                consultation.getPatient().getId(),
                "Consultation finalized on appointment completion");
    }
}
