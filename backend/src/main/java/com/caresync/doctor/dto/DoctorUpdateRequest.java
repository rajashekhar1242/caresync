package com.caresync.doctor.dto;

import com.caresync.common.util.MoneyUtils;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record DoctorUpdateRequest(
        @NotBlank(message = "Full name is required")
        @Size(min = 2, max = 100, message = "Full name must be between 2 and 100 characters")
        String fullName,

        @Pattern(regexp = "^\\+?[0-9]{10,15}$", message = "Phone must contain 10 to 15 digits optionally prefixed with +")
        String phone,

        @NotNull(message = "specializationId is required")
        UUID specializationId,

        @NotNull(message = "clinicId is required")
        UUID clinicId,

        @NotNull(message = "departmentId is required")
        UUID departmentId,

        @NotBlank(message = "consultationFee is required")
        @Pattern(regexp = MoneyUtils.MONEY_REGEX, message = "consultationFee must be a decimal string with 2 decimals (e.g. 1500.00)")
        String consultationFee,

        @NotNull(message = "slotMinutes is required")
        @Min(value = 5, message = "slotMinutes must be at least 5")
        @Max(value = 120, message = "slotMinutes must be at most 120")
        Integer slotMinutes,

        @NotNull(message = "active is required")
        Boolean active
) {
}
