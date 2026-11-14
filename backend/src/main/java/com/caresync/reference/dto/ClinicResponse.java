package com.caresync.reference.dto;

import com.caresync.reference.entity.Clinic;
import java.util.UUID;

public record ClinicResponse(
        UUID id,
        String name,
        String address,
        String timeZone
) {
    public static ClinicResponse from(Clinic clinic) {
        return new ClinicResponse(
                clinic.getId(),
                clinic.getName(),
                clinic.getAddress(),
                clinic.getTimeZone());
    }
}
