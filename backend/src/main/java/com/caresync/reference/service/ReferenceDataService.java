package com.caresync.reference.service;

import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.reference.dto.ClinicResponse;
import com.caresync.reference.dto.DepartmentRequest;
import com.caresync.reference.dto.DepartmentResponse;
import com.caresync.reference.dto.SpecializationResponse;
import com.caresync.reference.entity.Department;
import com.caresync.reference.repository.ClinicRepository;
import com.caresync.reference.repository.DepartmentRepository;
import com.caresync.reference.repository.SpecializationRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service for read-only reference data (clinics, specializations) and department management.
 */
@Service
public class ReferenceDataService {

    private final ClinicRepository clinicRepository;
    private final SpecializationRepository specializationRepository;
    private final DepartmentRepository departmentRepository;

    public ReferenceDataService(
            ClinicRepository clinicRepository,
            SpecializationRepository specializationRepository,
            DepartmentRepository departmentRepository) {
        this.clinicRepository = clinicRepository;
        this.specializationRepository = specializationRepository;
        this.departmentRepository = departmentRepository;
    }

    @Transactional(readOnly = true)
    public List<ClinicResponse> listClinics() {
        return clinicRepository.findAllByOrderByNameAsc().stream()
                .map(ClinicResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<SpecializationResponse> listSpecializations() {
        return specializationRepository.findAllByOrderByNameAsc().stream()
                .map(SpecializationResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<DepartmentResponse> listDepartments() {
        return departmentRepository.findAllByOrderByNameAsc().stream()
                .map(DepartmentResponse::from)
                .toList();
    }

    @Transactional
    public DepartmentResponse createDepartment(DepartmentRequest request) {
        String name = normalizeName(request.name());
        String description = normalizeDescription(request.description());

        if (departmentRepository.existsByNameIgnoreCase(name)) {
            throw new ConflictException(
                    ErrorCode.DEPARTMENT_NAME_EXISTS,
                    "A department with this name already exists");
        }

        Department department = new Department(UUID.randomUUID(), name, description);
        return saveDepartment(department);
    }

    @Transactional
    public DepartmentResponse updateDepartment(UUID departmentId, DepartmentRequest request) {
        Department department = departmentRepository.findById(departmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Department not found"));

        String name = normalizeName(request.name());
        String description = normalizeDescription(request.description());

        if (departmentRepository.existsByNameIgnoreCaseAndIdNot(name, departmentId)) {
            throw new ConflictException(
                    ErrorCode.DEPARTMENT_NAME_EXISTS,
                    "A department with this name already exists");
        }

        department.setName(name);
        department.setDescription(description);
        return saveDepartment(department);
    }

    private DepartmentResponse saveDepartment(Department department) {
        try {
            Department saved = departmentRepository.saveAndFlush(department);
            return DepartmentResponse.from(saved);
        } catch (DataIntegrityViolationException ex) {
            throw new ConflictException(
                    ErrorCode.DEPARTMENT_NAME_EXISTS,
                    "A department with this name already exists");
        }
    }

    private String normalizeName(String rawName) {
        String trimmed = rawName == null ? "" : rawName.trim();
        if (trimmed.length() < 2 || trimmed.length() > 100) {
            throw new ValidationException("name", "Department name must be between 2 and 100 characters");
        }
        return trimmed;
    }

    private String normalizeDescription(String rawDescription) {
        if (rawDescription == null || rawDescription.isBlank()) {
            return null;
        }
        return rawDescription.trim();
    }
}
