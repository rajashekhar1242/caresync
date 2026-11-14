package com.caresync.doctor.service;

import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.auth.repository.UserRepository;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.common.util.MoneyUtils;
import com.caresync.doctor.dto.DoctorCreateRequest;
import com.caresync.doctor.dto.DoctorResponse;
import com.caresync.doctor.dto.DoctorUpdateRequest;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.reference.repository.ClinicRepository;
import com.caresync.reference.repository.DepartmentRepository;
import com.caresync.reference.repository.SpecializationRepository;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service managing doctor profiles, linked DOCTOR user accounts, and role-filtered lookups.
 */
@Service
public class DoctorService {

    private final DoctorRepository doctorRepository;
    private final UserRepository userRepository;
    private final SpecializationRepository specializationRepository;
    private final ClinicRepository clinicRepository;
    private final DepartmentRepository departmentRepository;
    private final PasswordEncoder passwordEncoder;
    private final Clock clock;

    public DoctorService(
            DoctorRepository doctorRepository,
            UserRepository userRepository,
            SpecializationRepository specializationRepository,
            ClinicRepository clinicRepository,
            DepartmentRepository departmentRepository,
            PasswordEncoder passwordEncoder,
            Clock clock) {
        this.doctorRepository = doctorRepository;
        this.userRepository = userRepository;
        this.specializationRepository = specializationRepository;
        this.clinicRepository = clinicRepository;
        this.departmentRepository = departmentRepository;
        this.passwordEncoder = passwordEncoder;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PageResponse<DoctorResponse> listDoctors(
            UserPrincipal caller,
            UUID specializationId,
            UUID clinicId,
            String name,
            int page,
            int size,
            String sortParam) {
        Sort sort = resolveSort(sortParam);
        boolean activeOnly = caller.getRole() == Role.PATIENT;
        String normalizedName = normalizeSearchName(name);

        Specification<Doctor> spec = buildSpecification(specializationId, clinicId, normalizedName, activeOnly);
        PageRequest pageable = PageRequest.of(page, size, sort);
        Page<DoctorResponse> results = doctorRepository.findAll(spec, pageable)
                .map(DoctorResponse::from);
        return PageResponse.from(results);
    }

    @Transactional(readOnly = true)
    public DoctorResponse getDoctor(UserPrincipal caller, UUID doctorId) {
        Doctor doctor = doctorRepository.findWithUserById(doctorId)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));
        if (caller.getRole() == Role.PATIENT && !doctor.isActive()) {
            throw new ResourceNotFoundException("Doctor not found");
        }
        return DoctorResponse.from(doctor);
    }

    @Transactional
    public DoctorResponse createDoctor(DoctorCreateRequest request) {
        String normalizedFullName = normalizeFullName(request.fullName());
        String normalizedEmail = request.email().trim().toLowerCase(Locale.ROOT);
        validateSlotMinutes(request.slotMinutes());
        BigDecimal fee = MoneyUtils.parseNonNegative(request.consultationFee(), "consultationFee");
        verifyReferencesExist(request.specializationId(), request.clinicId(), request.departmentId());

        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new ConflictException(ErrorCode.EMAIL_ALREADY_EXISTS, "Email address is already registered");
        }

        User user = new User(
                UUID.randomUUID(),
                normalizedEmail,
                passwordEncoder.encode(request.password()),
                normalizedFullName,
                Role.DOCTOR,
                Instant.now(clock));
        try {
            user = userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException ex) {
            throw new ConflictException(ErrorCode.EMAIL_ALREADY_EXISTS, "Email address is already registered");
        }

        Doctor doctor = new Doctor(
                UUID.randomUUID(),
                user,
                request.specializationId(),
                request.clinicId(),
                request.departmentId(),
                request.phone(),
                fee,
                request.slotMinutes(),
                true);
        doctor = doctorRepository.saveAndFlush(doctor);
        return DoctorResponse.from(doctor);
    }

    @Transactional
    public DoctorResponse updateDoctor(UUID doctorId, DoctorUpdateRequest request) {
        Doctor doctor = doctorRepository.findWithUserById(doctorId)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));

        String normalizedFullName = normalizeFullName(request.fullName());
        validateSlotMinutes(request.slotMinutes());
        BigDecimal fee = MoneyUtils.parseNonNegative(request.consultationFee(), "consultationFee");
        verifyReferencesExist(request.specializationId(), request.clinicId(), request.departmentId());

        doctor.getUser().setFullName(normalizedFullName);
        doctor.setPhone(request.phone());
        doctor.setSpecializationId(request.specializationId());
        doctor.setClinicId(request.clinicId());
        doctor.setDepartmentId(request.departmentId());
        doctor.setConsultationFee(fee);
        doctor.setSlotMinutes(request.slotMinutes());
        doctor.setActive(request.active());

        Doctor saved = doctorRepository.saveAndFlush(doctor);
        return DoctorResponse.from(saved);
    }

    private void verifyReferencesExist(UUID specializationId, UUID clinicId, UUID departmentId) {
        if (!specializationRepository.existsById(specializationId)) {
            throw new ResourceNotFoundException("Specialization not found");
        }
        if (!clinicRepository.existsById(clinicId)) {
            throw new ResourceNotFoundException("Clinic not found");
        }
        if (!departmentRepository.existsById(departmentId)) {
            throw new ResourceNotFoundException("Department not found");
        }
    }

    private void validateSlotMinutes(Integer slotMinutes) {
        if (slotMinutes == null || slotMinutes < 5 || slotMinutes > 120 || slotMinutes % 5 != 0) {
            throw new ValidationException("slotMinutes", "slotMinutes must be between 5 and 120 in multiples of 5");
        }
    }

    private String normalizeFullName(String rawName) {
        String trimmed = rawName == null ? "" : rawName.trim();
        if (trimmed.length() < 2 || trimmed.length() > 100) {
            throw new ValidationException("fullName", "Full name must be between 2 and 100 characters");
        }
        return trimmed;
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

    private Sort resolveSort(String sortParam) {
        String effective = (sortParam == null || sortParam.isBlank()) ? "fullName,asc" : sortParam.trim();
        return switch (effective) {
            case "fullName,asc" -> Sort.by(Sort.Order.asc("user.fullName"), Sort.Order.asc("id"));
            case "fullName,desc" -> Sort.by(Sort.Order.desc("user.fullName"), Sort.Order.asc("id"));
            case "consultationFee,asc" -> Sort.by(Sort.Order.asc("consultationFee"), Sort.Order.asc("id"));
            case "consultationFee,desc" -> Sort.by(Sort.Order.desc("consultationFee"), Sort.Order.asc("id"));
            default -> throw new ValidationException(
                    "sort", "sort must be one of fullName,asc | fullName,desc | consultationFee,asc | consultationFee,desc");
        };
    }

    private Specification<Doctor> buildSpecification(
            UUID specializationId,
            UUID clinicId,
            String normalizedName,
            boolean activeOnly) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (specializationId != null) {
                predicates.add(cb.equal(root.get("specializationId"), specializationId));
            }
            if (clinicId != null) {
                predicates.add(cb.equal(root.get("clinicId"), clinicId));
            }
            if (activeOnly) {
                predicates.add(cb.isTrue(root.get("active")));
            }
            if (normalizedName != null) {
                Join<Doctor, User> userJoin = root.join("user");
                String escaped = normalizedName
                        .replace("\\", "\\\\")
                        .replace("%", "\\%")
                        .replace("_", "\\_");
                predicates.add(cb.like(cb.lower(userJoin.get("fullName")), "%" + escaped + "%", '\\'));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }
}
