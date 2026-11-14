package com.caresync.billing.entity;

import com.caresync.appointment.entity.Appointment;
import com.caresync.doctor.entity.Doctor;
import com.caresync.patient.entity.Patient;
import com.caresync.reference.entity.Clinic;
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
@Table(name = "invoices")
public class Invoice {

    @Id
    private UUID id;

    @Column(name = "invoice_number", nullable = false, unique = true, length = 32)
    private String invoiceNumber;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "appointment_id", nullable = false)
    private Appointment appointment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "doctor_id", nullable = false)
    private Doctor doctor;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "clinic_id", nullable = false)
    private Clinic clinic;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InvoiceStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 3)
    private Currency currency;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal total;

    @Column(name = "amount_paid", nullable = false, precision = 12, scale = 2)
    private BigDecimal amountPaid;

    @Column(name = "credited_total", nullable = false, precision = 12, scale = 2)
    private BigDecimal creditedTotal;

    @Column(name = "paid_at")
    private Instant paidAt;

    @Column(name = "void_reason", length = 500)
    private String voidReason;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Invoice() {
    }

    public Invoice(
            UUID id,
            String invoiceNumber,
            Appointment appointment,
            Patient patient,
            Doctor doctor,
            Clinic clinic,
            InvoiceStatus status,
            Currency currency,
            BigDecimal total,
            BigDecimal amountPaid,
            BigDecimal creditedTotal,
            Instant paidAt,
            Instant createdAt,
            Instant updatedAt) {
        this.id = id;
        this.invoiceNumber = invoiceNumber;
        this.appointment = appointment;
        this.patient = patient;
        this.doctor = doctor;
        this.clinic = clinic;
        this.status = status;
        this.currency = currency;
        this.total = total.setScale(2, RoundingMode.UNNECESSARY);
        this.amountPaid = amountPaid.setScale(2, RoundingMode.UNNECESSARY);
        this.creditedTotal = creditedTotal.setScale(2, RoundingMode.UNNECESSARY);
        this.paidAt = paidAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public String getInvoiceNumber() {
        return invoiceNumber;
    }

    public Appointment getAppointment() {
        return appointment;
    }

    public Patient getPatient() {
        return patient;
    }

    public Doctor getDoctor() {
        return doctor;
    }

    public Clinic getClinic() {
        return clinic;
    }

    public InvoiceStatus getStatus() {
        return status;
    }

    public void setStatus(InvoiceStatus status) {
        this.status = status;
    }

    public Currency getCurrency() {
        return currency;
    }

    public BigDecimal getTotal() {
        return total;
    }

    public void setTotal(BigDecimal total) {
        this.total = total.setScale(2, RoundingMode.UNNECESSARY);
    }

    public BigDecimal getAmountPaid() {
        return amountPaid;
    }

    public void setAmountPaid(BigDecimal amountPaid) {
        this.amountPaid = amountPaid.setScale(2, RoundingMode.UNNECESSARY);
    }

    public BigDecimal getCreditedTotal() {
        return creditedTotal;
    }

    public void setCreditedTotal(BigDecimal creditedTotal) {
        this.creditedTotal = creditedTotal.setScale(2, RoundingMode.UNNECESSARY);
    }

    public Instant getPaidAt() {
        return paidAt;
    }

    public void setPaidAt(Instant paidAt) {
        this.paidAt = paidAt;
    }

    public String getVoidReason() {
        return voidReason;
    }

    public void setVoidReason(String voidReason) {
        this.voidReason = voidReason;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public BigDecimal getBalance() {
        return total.subtract(amountPaid).setScale(2, RoundingMode.UNNECESSARY);
    }

    public BigDecimal getNetTotal() {
        return total.subtract(creditedTotal).setScale(2, RoundingMode.UNNECESSARY);
    }
}
