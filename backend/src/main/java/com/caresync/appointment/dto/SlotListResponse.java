package com.caresync.appointment.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record SlotListResponse(
        UUID doctorId,
        UUID clinicId,
        String timeZone,
        LocalDate date,
        int slotMinutes,
        SlotClosedReason closedReason,
        List<SlotResponse> slots
) {
}
