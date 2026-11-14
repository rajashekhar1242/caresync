package com.caresync.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.caresync.common.exception.ValidationException;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class MoneyUtilsTest {

    @Test
    void parsesAndFormatsValidAmounts() {
        assertThat(MoneyUtils.parseNonNegative("0.00", "fee")).isEqualByComparingTo("0.00");
        assertThat(MoneyUtils.parseNonNegative("1500.00", "fee")).isEqualByComparingTo("1500.00");
        assertThat(MoneyUtils.parsePositive("500.25", "amount")).isEqualByComparingTo("500.25");

        assertThat(MoneyUtils.format(BigDecimal.ZERO)).isEqualTo("0.00");
        assertThat(MoneyUtils.format(new BigDecimal("-0.00"))).isEqualTo("0.00");
        assertThat(MoneyUtils.formatSigned(new BigDecimal("-200.5"))).isEqualTo("-200.50");
        assertThat(MoneyUtils.formatSigned(new BigDecimal("-0.00"))).isEqualTo("0.00");
    }

    @Test
    void rejectsInvalidMoneyStringsAndNonPositiveAmounts() {
        assertThatThrownBy(() -> MoneyUtils.parseNonNegative("1500", "fee"))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> MoneyUtils.parseNonNegative("01.00", "fee"))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> MoneyUtils.parseNonNegative("-10.00", "fee"))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> MoneyUtils.parsePositive("0.00", "amount"))
                .isInstanceOf(ValidationException.class);
    }
}
