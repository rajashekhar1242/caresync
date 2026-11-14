package com.caresync.billing.dto;

import com.caresync.billing.entity.Currency;
import com.caresync.billing.entity.Payment;
import com.caresync.billing.entity.PaymentMethod;
import com.caresync.common.util.MoneyUtils;
import java.time.Instant;
import java.util.UUID;

public record PaymentResponse(
        UUID id,
        UUID invoiceId,
        String amount,
        Currency currency,
        PaymentMethod method,
        String txnRef,
        String receivedBy,
        Instant createdAt
) {
    public static PaymentResponse from(Payment payment) {
        return new PaymentResponse(
                payment.getId(),
                payment.getInvoice().getId(),
                MoneyUtils.format(payment.getAmount()),
                payment.getInvoice().getCurrency(),
                payment.getMethod(),
                payment.getTxnRef(),
                payment.getReceivedByName(),
                payment.getCreatedAt());
    }
}
