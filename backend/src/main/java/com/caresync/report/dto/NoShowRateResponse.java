package com.caresync.report.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record NoShowRateResponse(
        LocalDate from,
        LocalDate to,
        String timeZone,
        UUID clinicId,
        long completed,
        long noShow,
        long eligible,
        BigDecimal ratePercent
) {
}
