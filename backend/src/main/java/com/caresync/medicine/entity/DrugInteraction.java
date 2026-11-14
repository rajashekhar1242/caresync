package com.caresync.medicine.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "drug_interactions")
public class DrugInteraction {

    @Id
    private UUID id;

    @Column(name = "medicine_a_id", nullable = false)
    private UUID medicineAId;

    @Column(name = "medicine_b_id", nullable = false)
    private UUID medicineBId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private WarningSeverity severity;

    @Column(nullable = false, length = 500)
    private String message;

    protected DrugInteraction() {
    }

    public DrugInteraction(
            UUID id,
            UUID medicineAId,
            UUID medicineBId,
            WarningSeverity severity,
            String message) {
        this.id = id;
        this.medicineAId = medicineAId;
        this.medicineBId = medicineBId;
        this.severity = severity;
        this.message = message;
    }

    public UUID getId() {
        return id;
    }

    public UUID getMedicineAId() {
        return medicineAId;
    }

    public UUID getMedicineBId() {
        return medicineBId;
    }

    public WarningSeverity getSeverity() {
        return severity;
    }

    public String getMessage() {
        return message;
    }
}
