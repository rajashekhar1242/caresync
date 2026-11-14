package com.caresync.billing.dto;

import com.caresync.common.util.MoneyUtils;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreditNoteRequest(
        @NotBlank(message = "amount is required")
        @Pattern(regexp = MoneyUtils.MONEY_REGEX, message = "amount must be a decimal string with 2 decimals (e.g. 200.00)")
        String amount,

        @NotBlank(message = "reason is required")
        @Size(min = 5, max = 500, message = "reason must be between 5 and 500 characters")
        String reason
) {
}
