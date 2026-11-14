package com.caresync.appointment.dto;

import java.time.Instant;

public record SlotResponse(
        Instant start,
        Instant end,
        boolean available
) {
}
