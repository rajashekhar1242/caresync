package com.caresync.queue.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record QueueBoardResponse(
        UUID clinicId,
        String clinicName,
        String timeZone,
        LocalDate date,
        Instant generatedAt,
        List<QueueTokenView> doctors
) {
}
