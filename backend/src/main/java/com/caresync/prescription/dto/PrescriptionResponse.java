package com.caresync.prescription.dto;

import com.caresync.prescription.entity.Prescription;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record PrescriptionResponse(
        UUID id,
        UUID consultationId,
        UUID appointmentId,
        UUID patientId,
        String patientName,
        UUID doctorId,
        String doctorName,
        List<PrescriptionItemResponse> items,
        List<PrescriptionWarningDto> warnings,
        boolean severeWarningsAcknowledged,
        Instant createdAt) {

    public static PrescriptionResponse from(Prescription p) {
        return new PrescriptionResponse(
                p.getId(),
                p.getConsultation().getId(),
                p.getAppointment().getId(),
                p.getPatient().getId(),
                p.getPatient().getFullName(),
                p.getDoctor().getId(),
                p.getDoctor().getUser().getFullName(),
                p.getItems().stream().map(PrescriptionItemResponse::from).toList(),
                p.getWarnings().stream().map(PrescriptionWarningDto::from).toList(),
                p.isSevereWarningsAcknowledged(),
                p.getCreatedAt());
    }
}
