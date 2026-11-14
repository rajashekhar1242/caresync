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
@Table(name = "credit_notes")
public class CreditNote {

    @Id
    private UUID id;

    @Column(name = "credit_note_number", nullable = false, unique = true, length = 32)
    private String creditNoteNumber;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "invoice_id", nullable = false)
    private Invoice invoice;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(nullable = false, length = 500)
    private String reason;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_by_name", nullable = false, length = 100)
    private String createdByName;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected CreditNote() {
    }

    public CreditNote(
            UUID id,
            String creditNoteNumber,
            Invoice invoice,
            BigDecimal amount,
            String reason,
            UUID createdBy,
            String createdByName,
            Instant createdAt) {
        this.id = id;
        this.creditNoteNumber = creditNoteNumber;
        this.invoice = invoice;
        this.amount = amount.setScale(2, RoundingMode.UNNECESSARY);
        this.reason = reason;
        this.createdBy = createdBy;
        this.createdByName = createdByName;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public String getCreditNoteNumber() {
        return creditNoteNumber;
    }

    public Invoice getInvoice() {
        return invoice;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public String getReason() {
        return reason;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public String getCreatedByName() {
        return createdByName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
