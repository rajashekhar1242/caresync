package com.caresync.billing.dto;

import com.caresync.billing.entity.CreditNote;
import com.caresync.billing.entity.Currency;
import com.caresync.common.util.MoneyUtils;
import java.time.Instant;
import java.util.UUID;

public record CreditNoteResponse(
        UUID id,
        String creditNoteNumber,
        UUID invoiceId,
        String amount,
        Currency currency,
        String reason,
        String createdBy,
        Instant createdAt
) {
    public static CreditNoteResponse from(CreditNote creditNote) {
        return new CreditNoteResponse(
                creditNote.getId(),
                creditNote.getCreditNoteNumber(),
                creditNote.getInvoice().getId(),
                MoneyUtils.format(creditNote.getAmount()),
                creditNote.getInvoice().getCurrency(),
                creditNote.getReason(),
                creditNote.getCreatedByName(),
                creditNote.getCreatedAt());
    }
}
