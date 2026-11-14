package com.caresync.report.dto;

import com.caresync.billing.entity.Currency;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

public record DashboardSummaryResponse(
        UUID clinicId,
        String timeZone,
        LocalDate today,
        Instant generatedAt,
        AppointmentCounts appointmentsToday,
        long waitingNow,
        Currency currency,
        String collectedToday,
        String collectedThisMonth,
        String outstandingBalance,
        long unpaidInvoiceCount,
        long activeDoctors
) {
}
