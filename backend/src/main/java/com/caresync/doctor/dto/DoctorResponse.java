package com.caresync.doctor.dto;

import com.caresync.common.util.MoneyUtils;
import com.caresync.doctor.entity.Doctor;
import java.util.UUID;

/**
 * Doctor profile response. Contact fields ({@code email}, {@code phone}) are intentionally omitted.
 */
public record DoctorResponse(
        UUID id,
        UUID userId,
        String fullName,
        UUID specializationId,
        UUID clinicId,
        UUID departmentId,
        String consultationFee,
        int slotMinutes,
        boolean active
) {
    public static DoctorResponse from(Doctor doctor) {
        return new DoctorResponse(
                doctor.getId(),
                doctor.getUser().getId(),
                doctor.getUser().getFullName(),
                doctor.getSpecializationId(),
                doctor.getClinicId(),
                doctor.getDepartmentId(),
                MoneyUtils.format(doctor.getConsultationFee()),
                doctor.getSlotMinutes(),
                doctor.isActive());
    }
}
