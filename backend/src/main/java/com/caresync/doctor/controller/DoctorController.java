package com.caresync.doctor.controller;

import com.caresync.common.dto.PageResponse;
import com.caresync.common.security.SecurityUtils;
import com.caresync.doctor.dto.DoctorCreateRequest;
import com.caresync.doctor.dto.DoctorResponse;
import com.caresync.doctor.dto.DoctorUpdateRequest;
import com.caresync.doctor.service.DoctorService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/doctors")
@Validated
public class DoctorController {

    private final DoctorService doctorService;

    public DoctorController(DoctorService doctorService) {
        this.doctorService = doctorService;
    }

    @GetMapping
    public PageResponse<DoctorResponse> listDoctors(
            @RequestParam(required = false) UUID specializationId,
            @RequestParam(required = false) UUID clinicId,
            @RequestParam(required = false) @Size(min = 2, max = 100) String name,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(defaultValue = "fullName,asc") String sort) {
        return doctorService.listDoctors(
                SecurityUtils.requireCurrentPrincipal(),
                specializationId,
                clinicId,
                name,
                page,
                size,
                sort);
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public DoctorResponse createDoctor(@Valid @RequestBody DoctorCreateRequest request) {
        return doctorService.createDoctor(request);
    }

    @GetMapping("/{doctorId}")
    public DoctorResponse getDoctor(@PathVariable UUID doctorId) {
        return doctorService.getDoctor(SecurityUtils.requireCurrentPrincipal(), doctorId);
    }

    @PutMapping("/{doctorId}")
    @PreAuthorize("hasRole('ADMIN')")
    public DoctorResponse updateDoctor(
            @PathVariable UUID doctorId,
            @Valid @RequestBody DoctorUpdateRequest request) {
        return doctorService.updateDoctor(doctorId, request);
    }
}
