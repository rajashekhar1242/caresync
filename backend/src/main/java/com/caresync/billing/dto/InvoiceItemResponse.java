package com.caresync.billing.dto;

import com.caresync.billing.entity.InvoiceItem;
import com.caresync.common.util.MoneyUtils;
import java.time.Instant;
import java.util.UUID;

public record InvoiceItemResponse(
        UUID id,
        String description,
        int quantity,
        String unitPrice,
        String lineTotal,
        Instant createdAt
) {
    public static InvoiceItemResponse from(InvoiceItem item) {
        return new InvoiceItemResponse(
                item.getId(),
                item.getDescription(),
                item.getQuantity(),
                MoneyUtils.format(item.getUnitPrice()),
                MoneyUtils.format(item.getLineTotal()),
                item.getCreatedAt());
    }
}
