package com.caresync.common.util;

import com.caresync.common.exception.ValidationException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.regex.Pattern;

public final class MoneyUtils {

    public static final String MONEY_REGEX = "^(0|[1-9][0-9]{0,9})\\.[0-9]{2}$";
    public static final Pattern MONEY_PATTERN = Pattern.compile(MONEY_REGEX);
    public static final BigDecimal ZERO = new BigDecimal("0.00");

    private MoneyUtils() {
    }

    public static BigDecimal parseNonNegative(String raw, String fieldName) {
        if (raw == null || !MONEY_PATTERN.matcher(raw).matches()) {
            throw new ValidationException(fieldName, "must be a decimal string with 2 decimals (e.g. 1500.00)");
        }
        return new BigDecimal(raw).setScale(2, RoundingMode.UNNECESSARY);
    }

    public static BigDecimal parsePositive(String raw, String fieldName) {
        BigDecimal value = parseNonNegative(raw, fieldName);
        if (value.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ValidationException(fieldName, "must be greater than 0.00");
        }
        return value;
    }

    public static String format(BigDecimal value) {
        if (value == null || value.compareTo(BigDecimal.ZERO) == 0) {
            return "0.00";
        }
        return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    public static String formatSigned(BigDecimal value) {
        if (value == null || value.compareTo(BigDecimal.ZERO) == 0) {
            return "0.00";
        }
        return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }
}
