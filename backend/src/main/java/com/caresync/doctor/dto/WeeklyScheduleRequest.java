package com.caresync.doctor.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record WeeklyScheduleRequest(
        @NotNull(message = "entries is required")
        @Size(max = 28, message = "At most 28 schedule entries are allowed")
        List<@NotNull(message = "entry must not be null") @Valid ScheduleEntryDto> entries
) {
}
