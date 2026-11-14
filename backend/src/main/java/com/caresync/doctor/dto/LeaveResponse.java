package com.caresync.doctor.dto;

import com.caresync.doctor.entity.Leave;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record LeaveResponse(
        UUID id,
        UUID doctorId,
        LocalDate startDate,
        LocalDate endDate,
        String reason,
        Instant createdAt
) {
    public static LeaveResponse from(Leave leave) {
        return new LeaveResponse(
                leave.getId(),
                leave.getDoctorId(),
                leave.getStartDate(),
                leave.getEndDate(),
                leave.getReason(),
                leave.getCreatedAt());
    }
}
