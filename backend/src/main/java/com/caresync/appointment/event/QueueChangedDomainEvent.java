package com.caresync.appointment.event;

import java.time.LocalDate;
import java.util.UUID;

public record QueueChangedDomainEvent(
        UUID doctorId,
        UUID clinicId,
        LocalDate clinicDate,
        QueueEventType eventType
) {
}
