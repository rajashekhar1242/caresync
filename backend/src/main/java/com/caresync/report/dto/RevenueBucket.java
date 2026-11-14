package com.caresync.report.dto;

public record RevenueBucket(
        String period,
        long invoiceCount,
        String invoiced,
        String collected,
        String credited,
        String net
) {
}
