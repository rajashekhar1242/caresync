package com.caresync.reference.controller;

import com.caresync.reference.dto.DepartmentRequest;
import com.caresync.reference.dto.DepartmentResponse;
import com.caresync.reference.service.ReferenceDataService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/departments")
public class DepartmentController {

    private final ReferenceDataService referenceDataService;

    public DepartmentController(ReferenceDataService referenceDataService) {
        this.referenceDataService = referenceDataService;
    }

    @GetMapping
    public List<DepartmentResponse> listDepartments() {
        return referenceDataService.listDepartments();
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @ResponseStatus(HttpStatus.CREATED)
    public DepartmentResponse createDepartment(@Valid @RequestBody DepartmentRequest request) {
        return referenceDataService.createDepartment(request);
    }

    @PutMapping("/{departmentId}")
    @PreAuthorize("hasRole('ADMIN')")
    public DepartmentResponse updateDepartment(
            @PathVariable UUID departmentId,
            @Valid @RequestBody DepartmentRequest request) {
        return referenceDataService.updateDepartment(departmentId, request);
    }
}
