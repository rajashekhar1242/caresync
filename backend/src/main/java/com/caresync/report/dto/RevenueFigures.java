package com.caresync.report.dto;

public record RevenueFigures(
        long invoiceCount,
        String invoiced,
        String collected,
        String credited,
        String net
) {
}
