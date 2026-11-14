package com.caresync.billing.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "invoice_items")
public class InvoiceItem {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invoice_id", nullable = false)
    private Invoice invoice;

    @Column(nullable = false, length = 200)
    private String description;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "unit_price", nullable = false, precision = 12, scale = 2)
    private BigDecimal unitPrice;

    @Column(name = "line_total", nullable = false, precision = 12, scale = 2)
    private BigDecimal lineTotal;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected InvoiceItem() {
    }

    public InvoiceItem(
            UUID id,
            Invoice invoice,
            String description,
            int quantity,
            BigDecimal unitPrice,
            BigDecimal lineTotal,
            int sortOrder,
            Instant createdAt) {
        this.id = id;
        this.invoice = invoice;
        this.description = description;
        this.quantity = quantity;
        this.unitPrice = unitPrice.setScale(2, RoundingMode.UNNECESSARY);
        this.lineTotal = lineTotal.setScale(2, RoundingMode.UNNECESSARY);
        this.sortOrder = sortOrder;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public Invoice getInvoice() {
        return invoice;
    }

    public String getDescription() {
        return description;
    }

    public int getQuantity() {
        return quantity;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public BigDecimal getLineTotal() {
        return lineTotal;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
