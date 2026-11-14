package com.caresync.consultation.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;

public record VitalsDto(
        @Pattern(regexp = "^[0-9]{2,3}/[0-9]{2,3}$", message = "must match systolic/diastolic format such as 120/80")
        String bloodPressure,

        @Min(20)
        @Max(300)
        Integer pulse,

        @DecimalMin("30.0")
        @DecimalMax("45.0")
        @Digits(integer = 3, fraction = 1)
        BigDecimal temperature,

        @DecimalMin("0.5")
        @DecimalMax("500.0")
        @Digits(integer = 4, fraction = 1)
        BigDecimal weightKg,

        @Min(0)
        @Max(100)
        Integer spo2) {
}
