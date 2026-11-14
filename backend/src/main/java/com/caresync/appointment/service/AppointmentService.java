package com.caresync.appointment.service;

import com.caresync.appointment.dto.AppointmentCreateRequest;
import com.caresync.appointment.dto.AppointmentResponse;
import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.appointment.repository.AppointmentRepository;
import com.caresync.auth.entity.Role;
import com.caresync.common.dto.FieldError;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.common.util.TimeZoneUtils;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.doctor.repository.LeaveRepository;
import com.caresync.patient.entity.Patient;
import com.caresync.patient.repository.PatientRepository;
import com.caresync.reference.entity.Clinic;
import com.caresync.reference.repository.ClinicRepository;
import jakarta.persistence.criteria.Predicate;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AppointmentService {

    private final AppointmentRepository appointmentRepository;
    private final DoctorRepository doctorRepository;
    private final PatientRepository patientRepository;
    private final ClinicRepository clinicRepository;
    private final LeaveRepository leaveRepository;
    private final SlotService slotService;
    private final Clock clock;

    public AppointmentService(
            AppointmentRepository appointmentRepository,
            DoctorRepository doctorRepository,
            PatientRepository patientRepository,
            ClinicRepository clinicRepository,
            LeaveRepository leaveRepository,
            SlotService slotService,
            Clock clock) {
        this.appointmentRepository = appointmentRepository;
        this.doctorRepository = doctorRepository;
        this.patientRepository = patientRepository;
        this.clinicRepository = clinicRepository;
        this.leaveRepository = leaveRepository;
        this.slotService = slotService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public PageResponse<AppointmentResponse> listAppointments(
            UserPrincipal caller,
            UUID doctorId,
            UUID patientId,
            List<AppointmentStatus> statuses,
            Instant from,
            Instant to,
            int page,
            int size,
            String sortParam) {
        UUID effectiveDoctorId = doctorId;
        UUID effectivePatientId = patientId;

        if (caller.getRole() == Role.DOCTOR) {
            if (caller.getDoctorId() == null) {
                throw new ForbiddenException("Doctor profile is not linked to caller");
            }
            if (doctorId != null && !doctorId.equals(caller.getDoctorId())) {
                throw new ForbiddenException("Doctors can only view their own appointments");
            }
            effectiveDoctorId = caller.getDoctorId();
        } else if (caller.getRole() == Role.PATIENT) {
            if (caller.getPatientId() == null) {
                throw new ForbiddenException("Patient profile is not linked to caller");
            }
            if (patientId != null && !patientId.equals(caller.getPatientId())) {
                throw new ForbiddenException("Patients can only view their own appointments");
            }
            effectivePatientId = caller.getPatientId();
        }

        if (from != null && to != null && !from.isBefore(to)) {
            throw new ValidationException("from", "from must be strictly before to");
        }
        if (statuses != null && statuses.isEmpty()) {
            throw new ValidationException("status", "status filter must not be empty");
        }

        Sort sort = resolveSort(sortParam);
        Specification<Appointment> spec = buildSpecification(
                effectiveDoctorId, effectivePatientId, statuses, from, to);
        PageRequest pageable = PageRequest.of(page, size, sort);
        Page<AppointmentResponse> result = appointmentRepository.findAll(spec, pageable)
                .map(AppointmentResponse::from);
        return PageResponse.from(result);
    }

    @Transactional(readOnly = true)
    public AppointmentResponse getAppointment(UserPrincipal caller, UUID appointmentId) {
        Appointment appointment = appointmentRepository.findWithDetailsById(appointmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Appointment not found"));
        enforceReadOwnership(caller, appointment);
        return AppointmentResponse.from(appointment);
    }

    @Transactional
    public AppointmentResponse bookAppointment(UserPrincipal caller, AppointmentCreateRequest request) {
        Role role = caller.getRole();
        if (role == Role.DOCTOR) {
            throw new ForbiddenException("Doctors cannot book appointments");
        }
        if (role == Role.PATIENT && !request.patientId().equals(caller.getPatientId())) {
            throw new ForbiddenException("Patients can only book appointments for themselves");
        }

        Doctor doctor = doctorRepository.findWithUserById(request.doctorId())
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));
        Patient patient = patientRepository.findById(request.patientId())
                .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));
        Clinic clinic = clinicRepository.findById(doctor.getClinicId())
                .orElseThrow(() -> new ResourceNotFoundException("Clinic not found"));

        ZoneId clinicZone = TimeZoneUtils.resolveZone(clinic.getTimeZone());
        Instant slotStart = request.slotStart();
        Instant now = Instant.now(clock);

        // Step 2: weekly schedule alignment check
        if (!slotService.isValidScheduledSlotStart(doctor, clinicZone, slotStart)) {
            throw new ValidationException(
                    ErrorCode.INVALID_SLOT,
                    "Requested slotStart is not a valid slot start in the doctor's weekly schedule",
                    List.of(new FieldError("slotStart", "Does not match any scheduled slot start")));
        }

        // Step 3: booking window check (must not have started, and clinic-local date <= today + 30 days)
        LocalDate clinicToday = TimeZoneUtils.todayInZone(clinicZone, clock);
        LocalDate slotDate = TimeZoneUtils.toLocalDate(slotStart, clinicZone);
        if (!slotStart.isAfter(now)
                || slotDate.isBefore(clinicToday)
                || slotDate.isAfter(clinicToday.plusDays(SlotService.BOOKING_WINDOW_DAYS))) {
            throw new ValidationException(
                    ErrorCode.OUTSIDE_BOOKING_WINDOW,
                    "Requested slotStart is outside the 30-day booking window",
                    List.of(new FieldError("slotStart", "Slot must be in the future and within 30 days")));
        }

        // Step 4: doctor active & leave availability check
        if (!doctor.isActive() || leaveRepository.existsOverlappingLeave(doctor.getId(), slotDate, slotDate)) {
            throw new ConflictException(
                    ErrorCode.DOCTOR_UNAVAILABLE,
                    "Doctor is unavailable on the requested date");
        }

        // Step 5: slot exclusivity check + partial unique index guard
        if (appointmentRepository.existsActiveAtSlot(doctor.getId(), slotStart)) {
            throw new ConflictException(ErrorCode.SLOT_ALREADY_BOOKED, "Requested slot is already booked");
        }

        Instant slotEnd = slotStart.plusSeconds(doctor.getSlotMinutes() * 60L);
        String reason = request.reason() == null || request.reason().trim().isEmpty()
                ? null
                : request.reason().trim();

        Appointment appointment = new Appointment(
                UUID.randomUUID(),
                doctor,
                patient,
                clinic,
                slotStart,
                slotEnd,
                AppointmentStatus.BOOKED,
                reason,
                now,
                now);
        try {
            Appointment saved = appointmentRepository.saveAndFlush(appointment);
            return AppointmentResponse.from(saved);
        } catch (DataIntegrityViolationException ex) {
            throw new ConflictException(ErrorCode.SLOT_ALREADY_BOOKED, "Requested slot is already booked");
        }
    }

    private void enforceReadOwnership(UserPrincipal caller, Appointment appointment) {
        Role role = caller.getRole();
        if (role == Role.ADMIN || role == Role.RECEPTIONIST) {
            return;
        }
        if (role == Role.DOCTOR && appointment.getDoctor().getId().equals(caller.getDoctorId())) {
            return;
        }
        if (role == Role.PATIENT && appointment.getPatient().getId().equals(caller.getPatientId())) {
            return;
        }
        throw new ForbiddenException("You do not have permission to access this appointment");
    }

    private Sort resolveSort(String sortParam) {
        String effective = (sortParam == null || sortParam.isBlank()) ? "slotStart,asc" : sortParam.trim();
        return switch (effective) {
            case "slotStart,asc" -> Sort.by(Sort.Order.asc("slotStart"), Sort.Order.asc("id"));
            case "slotStart,desc" -> Sort.by(Sort.Order.desc("slotStart"), Sort.Order.asc("id"));
            default -> throw new ValidationException("sort", "sort must be slotStart,asc or slotStart,desc");
        };
    }

    private Specification<Appointment> buildSpecification(
            UUID doctorId,
            UUID patientId,
            List<AppointmentStatus> statuses,
            Instant from,
            Instant to) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (doctorId != null) {
                predicates.add(cb.equal(root.get("doctor").get("id"), doctorId));
            }
            if (patientId != null) {
                predicates.add(cb.equal(root.get("patient").get("id"), patientId));
            }
            if (statuses != null) {
                predicates.add(root.get("status").in(statuses));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("slotStart"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThan(root.get("slotStart"), to));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }
}
