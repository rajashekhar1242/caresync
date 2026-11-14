package com.caresync.doctor.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record LeaveRequest(
        @NotNull(message = "startDate is required")
        LocalDate startDate,

        @NotNull(message = "endDate is required")
        LocalDate endDate,

        @Size(max = 255, message = "reason must be at most 255 characters")
        String reason
) {
}
