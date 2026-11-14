package com.caresync.prescription.entity;

import com.caresync.medicine.entity.WarningSeverity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "prescription_warnings")
public class PrescriptionWarning {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "prescription_id", nullable = false)
    private Prescription prescription;

    @Enumerated(EnumType.STRING)
    @Column(name = "warning_type", nullable = false, length = 20)
    private WarningType warningType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private WarningSeverity severity;

    @Column(name = "medicine_a_id", nullable = false)
    private UUID medicineAId;

    @Column(name = "medicine_a_name", nullable = false, length = 200)
    private String medicineAName;

    @Column(name = "medicine_b_id")
    private UUID medicineBId;

    @Column(name = "medicine_b_name", length = 200)
    private String medicineBName;

    @Column(nullable = false, length = 500)
    private String message;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    protected PrescriptionWarning() {
    }

    public PrescriptionWarning(
            UUID id,
            Prescription prescription,
            WarningType warningType,
            WarningSeverity severity,
            UUID medicineAId,
            String medicineAName,
            UUID medicineBId,
            String medicineBName,
            String message,
            int sortOrder) {
        this.id = id;
        this.prescription = prescription;
        this.warningType = warningType;
        this.severity = severity;
        this.medicineAId = medicineAId;
        this.medicineAName = medicineAName;
        this.medicineBId = medicineBId;
        this.medicineBName = medicineBName;
        this.message = message;
        this.sortOrder = sortOrder;
    }

    public UUID getId() {
        return id;
    }

    public Prescription getPrescription() {
        return prescription;
    }

    public WarningType getWarningType() {
        return warningType;
    }

    public WarningSeverity getSeverity() {
        return severity;
    }

    public UUID getMedicineAId() {
        return medicineAId;
    }

    public String getMedicineAName() {
        return medicineAName;
    }

    public UUID getMedicineBId() {
        return medicineBId;
    }

    public String getMedicineBName() {
        return medicineBName;
    }

    public String getMessage() {
        return message;
    }

    public int getSortOrder() {
        return sortOrder;
    }
}
