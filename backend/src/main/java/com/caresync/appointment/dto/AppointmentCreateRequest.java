package com.caresync.appointment.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public record AppointmentCreateRequest(
        @NotNull(message = "doctorId is required")
        UUID doctorId,

        @NotNull(message = "patientId is required")
        UUID patientId,

        @NotNull(message = "slotStart is required")
        Instant slotStart,

        @Size(max = 500, message = "reason must be at most 500 characters")
        String reason
) {
}
