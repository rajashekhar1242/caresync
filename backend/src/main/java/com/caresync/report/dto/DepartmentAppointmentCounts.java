package com.caresync.report.dto;

import java.util.UUID;

public record DepartmentAppointmentCounts(
        UUID departmentId,
        String departmentName,
        long total,
        long booked,
        long checkedIn,
        long inConsultation,
        long completed,
        long cancelled,
        long noShow
) {
}
