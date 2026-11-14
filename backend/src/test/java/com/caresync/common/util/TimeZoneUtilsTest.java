package com.caresync.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;

class TimeZoneUtilsTest {

    @Test
    void handlesDstSpringForwardGapAndFallBackOverlap() {
        ZoneId newYork = ZoneId.of("America/New_York");

        // 2026-03-08 02:30 does not exist (spring forward gap -> skipped)
        assertThat(TimeZoneUtils.resolveSlotStartUtc(
                LocalDate.of(2026, 3, 8), LocalTime.of(2, 30), newYork)).isEmpty();

        // 2026-11-01 01:30 occurs twice (fall back overlap -> earlier offset EDT -04:00 = 05:30Z)
        var fallBack = TimeZoneUtils.resolveSlotStartUtc(
                LocalDate.of(2026, 11, 1), LocalTime.of(1, 30), newYork);
        assertThat(fallBack).contains(Instant.parse("2026-11-01T05:30:00Z"));
    }

    @Test
    void computesTodayAndDayBoundsInClinicZone() {
        ZoneId kolkata = ZoneId.of("Asia/Kolkata");
        Clock clock = Clock.fixed(Instant.parse("2026-11-11T20:00:00Z"), ZoneId.of("UTC"));

        // 20:00 UTC is 01:30 next day in Asia/Kolkata (+05:30)
        LocalDate today = TimeZoneUtils.todayInZone(kolkata, clock);
        assertThat(today).isEqualTo(LocalDate.of(2026, 11, 12));
        assertThat(TimeZoneUtils.startOfDayUtc(today, kolkata))
                .isEqualTo(Instant.parse("2026-11-11T18:30:00Z"));
        assertThat(TimeZoneUtils.exclusiveEndOfDayUtc(today, kolkata))
                .isEqualTo(Instant.parse("2026-11-12T18:30:00Z"));
    }
}
