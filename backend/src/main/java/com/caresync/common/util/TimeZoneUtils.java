package com.caresync.common.util;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Optional;

public final class TimeZoneUtils {

    private TimeZoneUtils() {
    }

    public static ZoneId resolveZone(String ianaId) {
        return ZoneId.of(ianaId);
    }

    public static LocalDate todayInZone(ZoneId zone, Clock clock) {
        return Instant.now(clock).atZone(zone).toLocalDate();
    }

    public static LocalDate toLocalDate(Instant instant, ZoneId zone) {
        return instant.atZone(zone).toLocalDate();
    }

    public static Instant startOfDayUtc(LocalDate date, ZoneId zone) {
        return date.atStartOfDay(zone).toInstant();
    }

    public static Instant exclusiveEndOfDayUtc(LocalDate date, ZoneId zone) {
        return date.plusDays(1).atStartOfDay(zone).toInstant();
    }

    /**
     * Resolves a clinic-local date and time to a UTC instant, skipping DST spring-forward
     * gaps and choosing the earlier offset during fall-back overlaps per domain.md 2.2.
     */
    public static Optional<Instant> resolveSlotStartUtc(LocalDate date, LocalTime time, ZoneId zone) {
        LocalDateTime localDateTime = LocalDateTime.of(date, time);
        if (zone.getRules().getTransition(localDateTime) != null
                && zone.getRules().getTransition(localDateTime).isGap()) {
            return Optional.empty();
        }
        ZonedDateTime zdt = ZonedDateTime.ofLocal(localDateTime, zone, null).withEarlierOffsetAtOverlap();
        return Optional.of(zdt.toInstant());
    }
}
