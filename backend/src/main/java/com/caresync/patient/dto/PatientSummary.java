package com.caresync.patient.dto;

import com.caresync.patient.entity.Gender;
import com.caresync.patient.entity.Patient;
import java.time.LocalDate;
import java.util.UUID;

public record PatientSummary(
        UUID id,
        String fullName,
        String phone,
        LocalDate dateOfBirth,
        Gender gender
) {
    public static PatientSummary from(Patient patient) {
        return new PatientSummary(
                patient.getId(),
                patient.getFullName(),
                patient.getPhone(),
                patient.getDateOfBirth(),
                patient.getGender());
    }
}
