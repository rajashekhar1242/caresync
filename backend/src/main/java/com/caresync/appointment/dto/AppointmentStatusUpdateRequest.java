package com.caresync.appointment.dto;

import com.caresync.appointment.entity.AppointmentStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AppointmentStatusUpdateRequest(
        @NotNull(message = "status is required")
        AppointmentStatus status,

        @Size(max = 500, message = "reason must be at most 500 characters")
        String reason
) {
}
