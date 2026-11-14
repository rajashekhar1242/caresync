package com.caresync.doctor.dto;

import java.util.List;
import java.util.UUID;

public record WeeklyScheduleResponse(
        UUID doctorId,
        List<ScheduleEntryDto> entries
) {
}
