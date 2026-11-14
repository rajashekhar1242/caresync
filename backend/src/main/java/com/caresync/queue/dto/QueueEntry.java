package com.caresync.queue.dto;

import com.caresync.appointment.entity.Appointment;
import java.time.Instant;
import java.util.UUID;

public record QueueEntry(
        int tokenNumber,
        UUID appointmentId,
        UUID patientId,
        String patientName,
        Instant slotStart,
        Instant checkedInAt
) {
    public static QueueEntry from(Appointment appointment) {
        return new QueueEntry(
                appointment.getTokenNumber() == null ? 0 : appointment.getTokenNumber(),
                appointment.getId(),
                appointment.getPatient().getId(),
                appointment.getPatient().getFullName(),
                appointment.getSlotStart(),
                appointment.getCheckedInAt());
    }
}
