package com.caresync.patient.controller;

import com.caresync.common.dto.PageResponse;
import com.caresync.common.security.SecurityUtils;
import com.caresync.patient.dto.PatientRequest;
import com.caresync.patient.dto.PatientResponse;
import com.caresync.patient.dto.PatientSummary;
import com.caresync.patient.service.PatientService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
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
@RequestMapping("/api/patients")
@Validated
public class PatientController {

    private final PatientService patientService;

    public PatientController(PatientService patientService) {
        this.patientService = patientService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RECEPTIONIST', 'DOCTOR')")
    public PageResponse<PatientSummary> searchPatients(
            @RequestParam(required = false) @Pattern(regexp = "^\\+?[0-9]{3,15}$") String phone,
            @RequestParam(required = false) @Size(min = 2, max = 100) String name,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return patientService.searchPatients(
                SecurityUtils.requireCurrentPrincipal(),
                phone,
                name,
                page,
                size);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RECEPTIONIST')")
    @ResponseStatus(HttpStatus.CREATED)
    public PatientResponse createPatient(@Valid @RequestBody PatientRequest request) {
        return patientService.createPatient(request);
    }

    @GetMapping("/{patientId}")
    public PatientResponse getPatient(@PathVariable UUID patientId) {
        return patientService.getPatient(SecurityUtils.requireCurrentPrincipal(), patientId);
    }

    @PutMapping("/{patientId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'RECEPTIONIST', 'PATIENT')")
    public PatientResponse updatePatient(
            @PathVariable UUID patientId,
            @Valid @RequestBody PatientRequest request) {
        return patientService.updatePatient(SecurityUtils.requireCurrentPrincipal(), patientId, request);
    }
}
