package com.caresync.billing.dto;

import com.caresync.billing.entity.PaymentMethod;
import com.caresync.common.util.MoneyUtils;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record PaymentRequest(
        @NotBlank(message = "amount is required")
        @Pattern(regexp = MoneyUtils.MONEY_REGEX, message = "amount must be a decimal string with 2 decimals (e.g. 500.00)")
        String amount,

        @NotNull(message = "method is required")
        PaymentMethod method,

        @Size(max = 100, message = "txnRef must be at most 100 characters")
        String txnRef
) {
}
