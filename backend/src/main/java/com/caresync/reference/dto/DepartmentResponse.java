package com.caresync.reference.dto;

import com.caresync.reference.entity.Department;
import java.util.UUID;

public record DepartmentResponse(
        UUID id,
        String name,
        String description
) {
    public static DepartmentResponse from(Department department) {
        return new DepartmentResponse(
                department.getId(),
                department.getName(),
                department.getDescription());
    }
}
