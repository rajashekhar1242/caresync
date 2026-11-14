package com.caresync.patient.dto;

import com.caresync.patient.entity.Gender;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

public record PatientRequest(
        @NotBlank(message = "fullName is required")
        @Size(min = 2, max = 100, message = "fullName must be between 2 and 100 characters")
        String fullName,

        @PastOrPresent(message = "dateOfBirth must not be in the future")
        LocalDate dateOfBirth,

        Gender gender,

        @Pattern(regexp = "^\\+?[0-9]{10,15}$", message = "phone must be 10 to 15 digits with optional leading +")
        String phone,

        @Email(message = "email must be a valid email address")
        @Size(max = 254, message = "email must be at most 254 characters")
        String email,

        @Size(max = 500, message = "address must be at most 500 characters")
        String address,

        @NotNull(message = "allergies is required")
        @Size(max = 50, message = "allergies may contain at most 50 entries")
        List<@NotBlank(message = "allergy entry must not be blank")
                @Size(min = 1, max = 100, message = "allergy entry must be between 1 and 100 characters") String> allergies
) {
}
