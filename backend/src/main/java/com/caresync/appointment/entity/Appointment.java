package com.caresync.appointment.entity;

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
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "appointments")
public class Appointment {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "doctor_id", nullable = false)
    private Doctor doctor;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "clinic_id", nullable = false)
    private Clinic clinic;

    @Column(name = "slot_start", nullable = false)
    private Instant slotStart;

    @Column(name = "slot_end", nullable = false)
    private Instant slotEnd;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 25)
    private AppointmentStatus status;

    @Column(length = 500)
    private String reason;

    @Column(name = "cancellation_reason", length = 500)
    private String cancellationReason;

    @Column(name = "token_number")
    private Integer tokenNumber;

    @Column(name = "checked_in_at")
    private Instant checkedInAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(nullable = false)
    private int version;

    protected Appointment() {
    }

    public Appointment(
            UUID id,
            Doctor doctor,
            Patient patient,
            Clinic clinic,
            Instant slotStart,
            Instant slotEnd,
            AppointmentStatus status,
            String reason,
            Instant createdAt,
            Instant updatedAt) {
        this.id = id;
        this.doctor = doctor;
        this.patient = patient;
        this.clinic = clinic;
        this.slotStart = slotStart;
        this.slotEnd = slotEnd;
        this.status = status;
        this.reason = reason;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
    }

    public Doctor getDoctor() {
        return doctor;
    }

    public Patient getPatient() {
        return patient;
    }

    public Clinic getClinic() {
        return clinic;
    }

    public Instant getSlotStart() {
        return slotStart;
    }

    public Instant getSlotEnd() {
        return slotEnd;
    }

    public AppointmentStatus getStatus() {
        return status;
    }

    public void setStatus(AppointmentStatus status) {
        this.status = status;
    }

    public String getReason() {
        return reason;
    }

    public String getCancellationReason() {
        return cancellationReason;
    }

    public void setCancellationReason(String cancellationReason) {
        this.cancellationReason = cancellationReason;
    }

    public Integer getTokenNumber() {
        return tokenNumber;
    }

    public void setTokenNumber(Integer tokenNumber) {
        this.tokenNumber = tokenNumber;
    }

    public Instant getCheckedInAt() {
        return checkedInAt;
    }

    public void setCheckedInAt(Instant checkedInAt) {
        this.checkedInAt = checkedInAt;
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

    public int getVersion() {
        return version;
    }
}
