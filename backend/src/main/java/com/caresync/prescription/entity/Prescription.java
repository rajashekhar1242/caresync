package com.caresync.prescription.entity;

import com.caresync.appointment.entity.Appointment;
import com.caresync.consultation.entity.Consultation;
import com.caresync.doctor.entity.Doctor;
import com.caresync.patient.entity.Patient;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.BatchSize;

@Entity
@Table(name = "prescriptions")
public class Prescription {

    @Id
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "consultation_id", nullable = false, unique = true)
    private Consultation consultation;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "appointment_id", nullable = false)
    private Appointment appointment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "patient_id", nullable = false)
    private Patient patient;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "doctor_id", nullable = false)
    private Doctor doctor;

    @Column(name = "severe_warnings_acknowledged", nullable = false)
    private boolean severeWarningsAcknowledged;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "prescription", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    @BatchSize(size = 50)
    private List<PrescriptionItem> items = new ArrayList<>();

    @OneToMany(mappedBy = "prescription", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC")
    @BatchSize(size = 50)
    private List<PrescriptionWarning> warnings = new ArrayList<>();

    protected Prescription() {
    }

    public Prescription(
            UUID id,
            Consultation consultation,
            Appointment appointment,
            Patient patient,
            Doctor doctor,
            boolean severeWarningsAcknowledged,
            Instant createdAt) {
        this.id = id;
        this.consultation = consultation;
        this.appointment = appointment;
        this.patient = patient;
        this.doctor = doctor;
        this.severeWarningsAcknowledged = severeWarningsAcknowledged;
        this.createdAt = createdAt;
    }

    public void addItem(PrescriptionItem item) {
        items.add(item);
    }

    public void addWarning(PrescriptionWarning warning) {
        warnings.add(warning);
    }

    public UUID getId() {
        return id;
    }

    public Consultation getConsultation() {
        return consultation;
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

    public boolean isSevereWarningsAcknowledged() {
        return severeWarningsAcknowledged;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public List<PrescriptionItem> getItems() {
        return items;
    }

    public List<PrescriptionWarning> getWarnings() {
        return warnings;
    }
}
