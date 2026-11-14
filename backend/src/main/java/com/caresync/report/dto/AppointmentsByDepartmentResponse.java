package com.caresync.report.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record AppointmentsByDepartmentResponse(
        LocalDate from,
        LocalDate to,
        String timeZone,
        UUID clinicId,
        AppointmentCounts totals,
        List<DepartmentAppointmentCounts> departments
) {
}
