package com.caresync.queue.dto;

import com.caresync.appointment.event.QueueEventType;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record QueueUpdateMessage(
        String type,
        QueueEventType event,
        UUID doctorId,
        UUID clinicId,
        LocalDate date,
        Integer nowServing,
        List<Integer> next,
        int waitingCount,
        Integer lastTokenIssued,
        Instant sentAt
) {
    public static final String TYPE_QUEUE_UPDATED = "QUEUE_UPDATED";
}
