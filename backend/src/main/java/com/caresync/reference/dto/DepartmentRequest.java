package com.caresync.reference.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record DepartmentRequest(
        @NotBlank(message = "Department name is required")
        @Size(min = 2, max = 100, message = "Department name must be between 2 and 100 characters")
        String name,

        @Size(max = 500, message = "Department description must be at most 500 characters")
        String description
) {
}
