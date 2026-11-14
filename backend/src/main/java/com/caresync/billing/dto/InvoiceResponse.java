package com.caresync.billing.dto;

import com.caresync.billing.entity.Currency;
import com.caresync.billing.entity.CreditNote;
import com.caresync.billing.entity.Invoice;
import com.caresync.billing.entity.InvoiceItem;
import com.caresync.billing.entity.InvoiceStatus;
import com.caresync.billing.entity.Payment;
import com.caresync.common.util.MoneyUtils;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record InvoiceResponse(
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
        String voidReason,
        UUID doctorId,
        UUID clinicId,
        List<InvoiceItemResponse> items,
        List<PaymentResponse> payments,
        List<CreditNoteResponse> creditNotes,
        String creditedTotal,
        String netTotal,
        Instant updatedAt
) {
    public static InvoiceResponse from(
            Invoice invoice,
            List<InvoiceItem> items,
            List<Payment> payments,
            List<CreditNote> creditNotes) {
        return new InvoiceResponse(
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
                invoice.getVoidReason(),
                invoice.getDoctor().getId(),
                invoice.getClinic().getId(),
                items.stream().map(InvoiceItemResponse::from).toList(),
                payments.stream().map(PaymentResponse::from).toList(),
                creditNotes.stream().map(CreditNoteResponse::from).toList(),
                MoneyUtils.format(invoice.getCreditedTotal()),
                MoneyUtils.format(invoice.getNetTotal()),
                invoice.getUpdatedAt());
    }
}
