package com.caresync.patient.service;

import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.service.AuditService;
import com.caresync.auth.entity.Role;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.patient.dto.PatientRequest;
import com.caresync.patient.dto.PatientResponse;
import com.caresync.patient.dto.PatientSummary;
import com.caresync.patient.entity.Patient;
import com.caresync.patient.repository.PatientRepository;
import jakarta.persistence.criteria.Predicate;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PatientService {

    private static final int MAX_ALLERGIES = 50;

    private final PatientRepository patientRepository;
    private final AuditService auditService;
    private final DoctorPatientScopePort doctorPatientScopePort;
    private final Clock clock;

    public PatientService(
            PatientRepository patientRepository,
            AuditService auditService,
            DoctorPatientScopePort doctorPatientScopePort,
            Clock clock) {
        this.patientRepository = patientRepository;
        this.auditService = auditService;
        this.doctorPatientScopePort = doctorPatientScopePort;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PageResponse<PatientSummary> searchPatients(
            UserPrincipal caller,
            String phone,
            String name,
            int page,
            int size) {
        Role role = caller.getRole();
        if (role != Role.ADMIN && role != Role.RECEPTIONIST && role != Role.DOCTOR) {
            throw new ForbiddenException("Only staff members can search patients");
        }

        PageRequest pageable = PageRequest.of(
                page, size, Sort.by(Sort.Order.asc("fullName"), Sort.Order.asc("id")));

        UUID scopedDoctorId = null;
        if (role == Role.DOCTOR) {
            if (caller.getDoctorId() == null) {
                throw new ForbiddenException("Doctor profile is not linked to caller");
            }
            scopedDoctorId = caller.getDoctorId();
        }

        String normalizedPhone = phone == null || phone.isBlank() ? null : phone.trim();
        String normalizedName = normalizeSearchName(name);

        Specification<Patient> spec = buildSearchSpecification(scopedDoctorId, normalizedPhone, normalizedName);
        Page<PatientSummary> pageResult = patientRepository.findAll(spec, pageable)
                .map(PatientSummary::from);
        return PageResponse.from(pageResult);
    }

    @Transactional
    public PatientResponse createPatient(PatientRequest request) {
        String normalizedFullName = normalizeFullName(request.fullName());
        validateDateOfBirth(request.dateOfBirth());
        List<String> normalizedAllergies = normalizeAllergies(request.allergies());
        Instant now = Instant.now(clock);

        Patient patient = new Patient(
                UUID.randomUUID(),
                null,
                normalizedFullName,
                request.dateOfBirth(),
                request.gender(),
                normalizeOptional(request.phone()),
                normalizeEmail(request.email()),
                normalizeOptional(request.address()),
                normalizedAllergies,
                now,
                now);
        Patient saved = patientRepository.saveAndFlush(patient);
        return PatientResponse.from(saved);
    }

    /**
     * Loads a full patient record and writes a mandatory PATIENT_READ audit entry in the same transaction.
     */
    @Transactional
    public PatientResponse getPatient(UserPrincipal caller, UUID patientId) {
        Patient patient = patientRepository.findById(patientId)
                .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));
        enforceReadAccess(caller, patientId);

        auditService.recordCurrentUser(
                AuditAction.PATIENT_READ,
                patient.getId(),
                patient.getId(),
                "Patient record accessed");
        return PatientResponse.from(patient);
    }

    @Transactional
    public PatientResponse updatePatient(UserPrincipal caller, UUID patientId, PatientRequest request) {
        Patient patient = patientRepository.findById(patientId)
                .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));
        enforceWriteAccess(caller, patientId);

        String normalizedFullName = normalizeFullName(request.fullName());
        validateDateOfBirth(request.dateOfBirth());
        List<String> normalizedAllergies = normalizeAllergies(request.allergies());

        patient.setFullName(normalizedFullName);
        patient.setDateOfBirth(request.dateOfBirth());
        patient.setGender(request.gender());
        patient.setPhone(normalizeOptional(request.phone()));
        patient.setEmail(normalizeEmail(request.email()));
        patient.setAddress(normalizeOptional(request.address()));
        patient.setAllergies(normalizedAllergies);
        patient.setUpdatedAt(Instant.now(clock));

        Patient saved = patientRepository.saveAndFlush(patient);
        return PatientResponse.from(saved);
    }

    /**
     * Returns true when the patient has at least one non-cancelled appointment with the given doctor.
     */
    @Transactional(readOnly = true)
    public boolean isDoctorOwnPatient(UUID doctorId, UUID patientId) {
        if (doctorId == null || patientId == null) {
            return false;
        }
        return doctorPatientScopePort.hasNonCancelledAppointment(doctorId, patientId);
    }

    private void enforceReadAccess(UserPrincipal caller, UUID patientId) {
        Role role = caller.getRole();
        if (role == Role.ADMIN || role == Role.RECEPTIONIST) {
            return;
        }
        if (role == Role.PATIENT) {
            if (!patientId.equals(caller.getPatientId())) {
                throw new ForbiddenException("Patients can only view their own record");
            }
            return;
        }
        if (role == Role.DOCTOR) {
            if (caller.getDoctorId() == null || !isDoctorOwnPatient(caller.getDoctorId(), patientId)) {
                throw new ForbiddenException("Doctors can only view records of their own patients");
            }
            return;
        }
        throw new ForbiddenException("Access denied");
    }

    private void enforceWriteAccess(UserPrincipal caller, UUID patientId) {
        Role role = caller.getRole();
        if (role == Role.ADMIN || role == Role.RECEPTIONIST) {
            return;
        }
        if (role == Role.PATIENT) {
            if (!patientId.equals(caller.getPatientId())) {
                throw new ForbiddenException("Patients can only update their own record");
            }
            return;
        }
        throw new ForbiddenException("Doctors cannot update patient profiles through this endpoint");
    }

    private String normalizeFullName(String rawName) {
        String trimmed = rawName == null ? "" : rawName.trim();
        if (trimmed.length() < 2 || trimmed.length() > 100) {
            throw new ValidationException("fullName", "fullName must be between 2 and 100 characters");
        }
        return trimmed;
    }

    private void validateDateOfBirth(LocalDate dateOfBirth) {
        if (dateOfBirth != null && dateOfBirth.isAfter(LocalDate.now(clock))) {
            throw new ValidationException("dateOfBirth", "dateOfBirth must not be in the future");
        }
    }

    private List<String> normalizeAllergies(List<String> rawAllergies) {
        if (rawAllergies == null) {
            throw new ValidationException("allergies", "allergies must not be null");
        }
        if (rawAllergies.size() > MAX_ALLERGIES) {
            throw new ValidationException("allergies", "allergies may contain at most " + MAX_ALLERGIES + " entries");
        }
        LinkedHashMap<String, String> deduped = new LinkedHashMap<>();
        for (String entry : rawAllergies) {
            String trimmed = entry == null ? "" : entry.trim();
            if (trimmed.isEmpty() || trimmed.length() > 100) {
                throw new ValidationException("allergies", "Each allergy entry must be between 1 and 100 characters");
            }
            deduped.putIfAbsent(trimmed.toLowerCase(Locale.ROOT), trimmed);
        }
        return List.copyOf(deduped.values());
    }

    private String normalizeOptional(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String normalizeEmail(String rawEmail) {
        String normalized = normalizeOptional(rawEmail);
        return normalized == null ? null : normalized.toLowerCase(Locale.ROOT);
    }

    private String normalizeSearchName(String rawName) {
        if (rawName == null) {
            return null;
        }
        String trimmed = rawName.trim();
        if (trimmed.length() < 2 || trimmed.length() > 100) {
            throw new ValidationException("name", "name filter must be between 2 and 100 characters");
        }
        return trimmed.toLowerCase(Locale.ROOT);
    }

    private Specification<Patient> buildSearchSpecification(
            UUID scopedDoctorId,
            String normalizedPhone,
            String normalizedName) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (scopedDoctorId != null) {
                predicates.add(doctorPatientScopePort.doctorOwnPatientPredicate(root, query, cb, scopedDoctorId));
            }
            if (normalizedPhone != null) {
                predicates.add(cb.like(root.get("phone"), escapeLike(normalizedPhone) + "%", '\\'));
            }
            if (normalizedName != null) {
                predicates.add(cb.like(cb.lower(root.get("fullName")), "%" + escapeLike(normalizedName) + "%", '\\'));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private static String escapeLike(String raw) {
        return raw
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }
}
