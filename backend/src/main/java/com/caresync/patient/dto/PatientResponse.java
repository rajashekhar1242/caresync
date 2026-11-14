package com.caresync.patient.dto;

import com.caresync.patient.entity.Gender;
import com.caresync.patient.entity.Patient;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record PatientResponse(
        UUID id,
        UUID userId,
        String fullName,
        LocalDate dateOfBirth,
        Gender gender,
        String phone,
        String email,
        String address,
        List<String> allergies,
        Instant createdAt,
        Instant updatedAt
) {
    public static PatientResponse from(Patient patient) {
        return new PatientResponse(
                patient.getId(),
                patient.getUserId(),
                patient.getFullName(),
                patient.getDateOfBirth(),
                patient.getGender(),
                patient.getPhone(),
                patient.getEmail(),
                patient.getAddress(),
                List.copyOf(patient.getAllergies()),
                patient.getCreatedAt(),
                patient.getUpdatedAt());
    }
}
