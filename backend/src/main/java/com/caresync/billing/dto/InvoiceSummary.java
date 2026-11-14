package com.caresync.billing.dto;

import com.caresync.billing.entity.Currency;
import com.caresync.billing.entity.Invoice;
import com.caresync.billing.entity.InvoiceStatus;
import com.caresync.common.util.MoneyUtils;
import java.time.Instant;
import java.util.UUID;

public record InvoiceSummary(
        UUID id,
        String invoiceNumber,
        UUID appointmentId,
        UUID patientId,
        String patientName,
        String doctorName,
        InvoiceStatus status,
        Currency currency,
        String total,
        String amountPaid,
        String balance,
        Instant createdAt,
        Instant paidAt,
        String voidReason
) {
    public static InvoiceSummary from(Invoice invoice) {
        return new InvoiceSummary(
                invoice.getId(),
                invoice.getInvoiceNumber(),
                invoice.getAppointment().getId(),
                invoice.getPatient().getId(),
                invoice.getPatient().getFullName(),
                invoice.getDoctor().getUser().getFullName(),
                invoice.getStatus(),
                invoice.getCurrency(),
                MoneyUtils.format(invoice.getTotal()),
                MoneyUtils.format(invoice.getAmountPaid()),
                MoneyUtils.format(invoice.getBalance()),
                invoice.getCreatedAt(),
                invoice.getPaidAt(),
                invoice.getVoidReason());
    }
}
