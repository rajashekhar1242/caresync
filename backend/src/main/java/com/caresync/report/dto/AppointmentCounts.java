package com.caresync.report.dto;

public record AppointmentCounts(
        long total,
        long booked,
        long checkedIn,
        long inConsultation,
        long completed,
        long cancelled,
        long noShow
) {
}
