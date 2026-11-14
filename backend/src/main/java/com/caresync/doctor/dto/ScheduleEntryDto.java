package com.caresync.doctor.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.time.DayOfWeek;

public record ScheduleEntryDto(
        @NotNull(message = "dayOfWeek is required")
        DayOfWeek dayOfWeek,

        @NotBlank(message = "startTime is required")
        @Pattern(regexp = "^([01][0-9]|2[0-3]):[0-5][0-9]$", message = "startTime must be 24-hour HH:mm")
        String startTime,

        @NotBlank(message = "endTime is required")
        @Pattern(regexp = "^([01][0-9]|2[0-3]):[0-5][0-9]$", message = "endTime must be 24-hour HH:mm")
        String endTime
) {
}
