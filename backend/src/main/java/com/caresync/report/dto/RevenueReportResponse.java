package com.caresync.report.dto;

import com.caresync.billing.entity.Currency;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record RevenueReportResponse(
        LocalDate from,
        LocalDate to,
        String timeZone,
        UUID clinicId,
        ReportGroupBy groupBy,
        Currency currency,
        RevenueFigures totals,
        List<RevenueBucket> buckets
) {
}
