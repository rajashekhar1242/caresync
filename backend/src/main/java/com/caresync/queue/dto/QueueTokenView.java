package com.caresync.queue.dto;

import java.util.List;
import java.util.UUID;

public record QueueTokenView(
        UUID doctorId,
        String doctorName,
        Integer nowServing,
        List<Integer> next,
        int waitingCount,
        Integer lastTokenIssued
) {
}
