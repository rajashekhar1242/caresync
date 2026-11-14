package com.caresync.consultation.dto;

import com.caresync.consultation.entity.Consultation;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record ConsultationResponse(
        UUID id,
        UUID appointmentId,
        UUID patientId,
        String patientName,
        UUID doctorId,
        String doctorName,
        VitalsDto vitals,
        String symptoms,
        String diagnosis,
        String notes,
        LocalDate followUpDate,
        boolean finalized,
        Instant finalizedAt,
        Instant createdAt,
        Instant updatedAt) {

    public static ConsultationResponse from(Consultation c) {
        VitalsDto vitals = hasAnyVital(c)
                ? new VitalsDto(
                        c.getVitalsBloodPressure(),
                        c.getVitalsPulse(),
                        c.getVitalsTemperature(),
                        c.getVitalsWeightKg(),
                        c.getVitalsSpo2())
                : null;
        return new ConsultationResponse(
                c.getId(),
                c.getAppointment().getId(),
                c.getPatient().getId(),
                c.getPatient().getFullName(),
                c.getDoctor().getId(),
                c.getDoctor().getUser().getFullName(),
                vitals,
                c.getSymptoms(),
                c.getDiagnosis(),
                c.getNotes(),
                c.getFollowUpDate(),
                c.isFinalized(),
                c.getFinalizedAt(),
                c.getCreatedAt(),
                c.getUpdatedAt());
    }

    private static boolean hasAnyVital(Consultation c) {
        return c.getVitalsBloodPressure() != null
                || c.getVitalsPulse() != null
                || c.getVitalsTemperature() != null
                || c.getVitalsWeightKg() != null
                || c.getVitalsSpo2() != null;
    }
}
