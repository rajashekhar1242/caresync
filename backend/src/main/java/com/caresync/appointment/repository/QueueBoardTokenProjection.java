package com.caresync.appointment.repository;

import com.caresync.appointment.entity.AppointmentStatus;
import java.util.UUID;

public record QueueBoardTokenProjection(
        UUID doctorId,
        AppointmentStatus status,
        Integer tokenNumber
) {
}
