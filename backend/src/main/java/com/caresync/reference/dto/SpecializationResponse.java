package com.caresync.reference.dto;

import com.caresync.reference.entity.Specialization;
import java.util.UUID;

public record SpecializationResponse(
        UUID id,
        String name
) {
    public static SpecializationResponse from(Specialization specialization) {
        return new SpecializationResponse(specialization.getId(), specialization.getName());
    }
}
