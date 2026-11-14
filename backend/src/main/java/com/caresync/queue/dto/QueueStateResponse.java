package com.caresync.queue.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record QueueStateResponse(
        UUID doctorId,
        String doctorName,
        UUID clinicId,
        String timeZone,
        LocalDate date,
        QueueEntry nowServing,
        List<QueueEntry> next,
        int waitingCount,
        Integer lastTokenIssued,
        Instant generatedAt
) {
}
