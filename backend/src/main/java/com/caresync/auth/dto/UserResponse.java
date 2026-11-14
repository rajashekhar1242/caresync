package com.caresync.auth.dto;

import com.caresync.auth.entity.Role;
import java.util.UUID;

public record UserResponse(
        UUID id,
        String email,
        String fullName,
        Role role,
        UUID patientId,
        UUID doctorId
) {
}
