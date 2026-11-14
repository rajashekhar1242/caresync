package com.caresync.billing.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
@Table(name = "payments")
public class Payment {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invoice_id", nullable = false)
    private Invoice invoice;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private PaymentMethod method;

    @Column(name = "txn_ref", length = 100)
    private String txnRef;

    @Column(name = "received_by", nullable = false)
    private UUID receivedBy;

    @Column(name = "received_by_name", nullable = false, length = 100)
    private String receivedByName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Payment() {
    }

    public Payment(
            UUID id,
            Invoice invoice,
            BigDecimal amount,
            PaymentMethod method,
            String txnRef,
            UUID receivedBy,
            String receivedByName,
            Instant createdAt) {
        this.id = id;
        this.invoice = invoice;
        this.amount = amount.setScale(2, RoundingMode.UNNECESSARY);
        this.method = method;
        this.txnRef = txnRef;
        this.receivedBy = receivedBy;
        this.receivedByName = receivedByName;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public Invoice getInvoice() {
        return invoice;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public PaymentMethod getMethod() {
        return method;
    }

    public String getTxnRef() {
        return txnRef;
    }

    public UUID getReceivedBy() {
        return receivedBy;
    }

    public String getReceivedByName() {
        return receivedByName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
