package com.caresync.consultation.entity;

import com.caresync.appointment.entity.Appointment;
import com.caresync.doctor.entity.Doctor;
import com.caresync.patient.entity.Patient;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "consultations")
public class Consultation {

    @Id
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "appointment_id", nullable = false, unique = true)
    private Appointment appointment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "doctor_id", nullable = false)
    private Doctor doctor;

    @Column(name = "vitals_blood_pressure", length = 10)
    private String vitalsBloodPressure;

    @Column(name = "vitals_pulse")
    private Integer vitalsPulse;

    @Column(name = "vitals_temperature", precision = 4, scale = 1)
    private BigDecimal vitalsTemperature;

    @Column(name = "vitals_weight_kg", precision = 5, scale = 1)
    private BigDecimal vitalsWeightKg;

    @Column(name = "vitals_spo2")
    private Integer vitalsSpo2;

    @Column(length = 2000)
    private String symptoms;

    @Column(length = 2000)
    private String diagnosis;

    @Column(length = 5000)
    private String notes;

    @Column(name = "follow_up_date")
    private LocalDate followUpDate;

    @Column(name = "finalized_at")
    private Instant finalizedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Consultation() {
    }

    public Consultation(
            UUID id,
            Appointment appointment,
            Patient patient,
            Doctor doctor,
            Instant createdAt,
            Instant updatedAt) {
        this.id = id;
        this.appointment = appointment;
        this.patient = patient;
        this.doctor = doctor;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public UUID getId() {
        return id;
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

    public String getVitalsBloodPressure() {
        return vitalsBloodPressure;
    }

    public void setVitalsBloodPressure(String vitalsBloodPressure) {
        this.vitalsBloodPressure = vitalsBloodPressure;
    }

    public Integer getVitalsPulse() {
        return vitalsPulse;
    }

    public void setVitalsPulse(Integer vitalsPulse) {
        this.vitalsPulse = vitalsPulse;
    }

    public BigDecimal getVitalsTemperature() {
        return vitalsTemperature;
    }

    public void setVitalsTemperature(BigDecimal vitalsTemperature) {
        this.vitalsTemperature = vitalsTemperature;
    }

    public BigDecimal getVitalsWeightKg() {
        return vitalsWeightKg;
    }

    public void setVitalsWeightKg(BigDecimal vitalsWeightKg) {
        this.vitalsWeightKg = vitalsWeightKg;
    }

    public Integer getVitalsSpo2() {
        return vitalsSpo2;
    }

    public void setVitalsSpo2(Integer vitalsSpo2) {
        this.vitalsSpo2 = vitalsSpo2;
    }

    public String getSymptoms() {
        return symptoms;
    }

    public void setSymptoms(String symptoms) {
        this.symptoms = symptoms;
    }

    public String getDiagnosis() {
        return diagnosis;
    }

    public void setDiagnosis(String diagnosis) {
        this.diagnosis = diagnosis;
    }

    public String getNotes() {
        return notes;
    }

    public void setNotes(String notes) {
        this.notes = notes;
    }

    public LocalDate getFollowUpDate() {
        return followUpDate;
    }

    public void setFollowUpDate(LocalDate followUpDate) {
        this.followUpDate = followUpDate;
    }

    public Instant getFinalizedAt() {
        return finalizedAt;
    }

    public boolean isFinalized() {
        return finalizedAt != null;
    }

    public void finalizeAt(Instant finalizedAt, Instant updatedAt) {
        if (this.finalizedAt == null) {
            this.finalizedAt = finalizedAt;
        }
        this.updatedAt = updatedAt;
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
}
