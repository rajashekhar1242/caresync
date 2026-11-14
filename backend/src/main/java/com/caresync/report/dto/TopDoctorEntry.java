package com.caresync.report.dto;

import java.util.UUID;

public record TopDoctorEntry(
        int rank,
        UUID doctorId,
        String doctorName,
        UUID departmentId,
        String departmentName,
        long completedAppointments,
        long noShows,
        String collected
) {
}
