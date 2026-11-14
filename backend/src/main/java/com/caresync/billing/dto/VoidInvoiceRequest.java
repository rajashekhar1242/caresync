package com.caresync.billing.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record VoidInvoiceRequest(
        @NotBlank(message = "reason is required")
        @Size(min = 5, max = 500, message = "reason must be between 5 and 500 characters")
        String reason
) {
}
