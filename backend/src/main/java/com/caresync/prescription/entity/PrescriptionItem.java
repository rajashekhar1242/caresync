package com.caresync.prescription.entity;

import com.caresync.medicine.entity.Medicine;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "prescription_items")
public class PrescriptionItem {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "prescription_id", nullable = false)
    private Prescription prescription;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "medicine_id", nullable = false)
    private Medicine medicine;

    @Column(nullable = false, length = 100)
    private String dosage;

    @Column(nullable = false, length = 100)
    private String frequency;

    @Column(name = "duration_days", nullable = false)
    private int durationDays;

    @Column(length = 500)
    private String instructions;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    protected PrescriptionItem() {
    }

    public PrescriptionItem(
            UUID id,
            Prescription prescription,
            Medicine medicine,
            String dosage,
            String frequency,
            int durationDays,
            String instructions,
            int sortOrder) {
        this.id = id;
        this.prescription = prescription;
        this.medicine = medicine;
        this.dosage = dosage;
        this.frequency = frequency;
        this.durationDays = durationDays;
        this.instructions = instructions;
        this.sortOrder = sortOrder;
    }

    public UUID getId() {
        return id;
    }

    public Prescription getPrescription() {
        return prescription;
    }

    public Medicine getMedicine() {
        return medicine;
    }

    public String getDosage() {
        return dosage;
    }

    public String getFrequency() {
        return frequency;
    }

    public int getDurationDays() {
        return durationDays;
    }

    public String getInstructions() {
        return instructions;
    }

    public int getSortOrder() {
        return sortOrder;
    }
}
