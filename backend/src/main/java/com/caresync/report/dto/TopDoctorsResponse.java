package com.caresync.report.dto;

import com.caresync.billing.entity.Currency;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record TopDoctorsResponse(
        LocalDate from,
        LocalDate to,
        String timeZone,
        UUID clinicId,
        TopDoctorRankBy rankBy,
        Currency currency,
        List<TopDoctorEntry> doctors
) {
}
