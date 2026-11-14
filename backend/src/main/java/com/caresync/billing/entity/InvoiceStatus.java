package com.caresync.billing.entity;

/**
 * Lifecycle states of an {@link Invoice}.
 */
public enum InvoiceStatus {
    PENDING,
    PARTIALLY_PAID,
    PAID,
    VOID
}
