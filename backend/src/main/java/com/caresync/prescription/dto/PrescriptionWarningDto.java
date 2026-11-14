package com.caresync.prescription.dto;

import com.caresync.medicine.entity.WarningSeverity;
import com.caresync.prescription.entity.PrescriptionWarning;
import com.caresync.prescription.entity.WarningType;
import java.util.List;

public record PrescriptionWarningDto(
        WarningType type,
        WarningSeverity severity,
        List<MedicineRef> medicines,
        String message) {

    public static PrescriptionWarningDto from(PrescriptionWarning w) {
        List<MedicineRef> meds = w.getMedicineBId() == null
                ? List.of(new MedicineRef(w.getMedicineAId(), w.getMedicineAName()))
                : List.of(
                        new MedicineRef(w.getMedicineAId(), w.getMedicineAName()),
                        new MedicineRef(w.getMedicineBId(), w.getMedicineBName()));
        return new PrescriptionWarningDto(w.getWarningType(), w.getSeverity(), meds, w.getMessage());
    }
}
