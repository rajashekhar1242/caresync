package com.caresync.appointment.dto;

import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import java.time.Instant;
import java.util.UUID;

public record AppointmentResponse(
        UUID id,
        UUID doctorId,
        String doctorName,
        UUID patientId,
        String patientName,
        UUID clinicId,
        String timeZone,
        Instant slotStart,
        Instant slotEnd,
        AppointmentStatus status,
        String reason,
        String cancellationReason,
        Integer tokenNumber,
        Instant createdAt,
        Instant updatedAt
) {
    public static AppointmentResponse from(Appointment appointment) {
        return new AppointmentResponse(
                appointment.getId(),
                appointment.getDoctor().getId(),
                appointment.getDoctor().getUser().getFullName(),
                appointment.getPatient().getId(),
                appointment.getPatient().getFullName(),
                appointment.getClinic().getId(),
                appointment.getClinic().getTimeZone(),
                appointment.getSlotStart(),
                appointment.getSlotEnd(),
                appointment.getStatus(),
                appointment.getReason(),
                appointment.getCancellationReason(),
                appointment.getTokenNumber(),
                appointment.getCreatedAt(),
                appointment.getUpdatedAt());
    }
}
