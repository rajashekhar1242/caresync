package com.caresync.medicine.dto;

import com.caresync.medicine.entity.Medicine;
import com.caresync.medicine.entity.MedicineForm;
import java.util.UUID;

public record MedicineResponse(
        UUID id,
        String name,
        String genericName,
        String strength,
        MedicineForm form,
        String drugClass) {

    public static MedicineResponse from(Medicine m) {
        return new MedicineResponse(
                m.getId(),
                m.getName(),
                m.getGenericName(),
                m.getStrength(),
                m.getForm(),
                m.getDrugClass());
    }
}
