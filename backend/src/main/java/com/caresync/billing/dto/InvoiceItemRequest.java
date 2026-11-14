package com.caresync.billing.dto;

import com.caresync.common.util.MoneyUtils;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record InvoiceItemRequest(
        @NotBlank(message = "description is required")
        @Size(min = 1, max = 200, message = "description must be between 1 and 200 characters")
        String description,

        @NotNull(message = "quantity is required")
        @Min(value = 1, message = "quantity must be at least 1")
        @Max(value = 100, message = "quantity must be at most 100")
        Integer quantity,

        @NotBlank(message = "unitPrice is required")
        @Pattern(regexp = MoneyUtils.MONEY_REGEX, message = "unitPrice must be a decimal string with 2 decimals (e.g. 350.00)")
        String unitPrice
) {
}
