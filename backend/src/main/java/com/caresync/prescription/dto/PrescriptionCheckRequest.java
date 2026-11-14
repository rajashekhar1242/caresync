package com.caresync.prescription.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.UUID;

public record PrescriptionCheckRequest(
        @NotNull UUID patientId,
        @NotNull @Size(min = 1, max = 20) List<@NotNull UUID> medicineIds) {
}
