package com.caresync.prescription.dto;

import com.caresync.medicine.dto.MedicineResponse;
import com.caresync.prescription.entity.PrescriptionItem;

public record PrescriptionItemResponse(
        MedicineResponse medicine,
        String dosage,
        String frequency,
        int durationDays,
        String instructions) {

    public static PrescriptionItemResponse from(PrescriptionItem item) {
        return new PrescriptionItemResponse(
                MedicineResponse.from(item.getMedicine()),
                item.getDosage(),
                item.getFrequency(),
                item.getDurationDays(),
                item.getInstructions());
    }
}
