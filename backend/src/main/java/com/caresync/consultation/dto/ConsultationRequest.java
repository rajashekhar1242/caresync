package com.caresync.consultation.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record ConsultationRequest(
        @Valid
        VitalsDto vitals,

        @Size(max = 2000)
        String symptoms,

        @Size(max = 2000)
        String diagnosis,

        @Size(max = 5000)
        String notes,

        LocalDate followUpDate) {
}
