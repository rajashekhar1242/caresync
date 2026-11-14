package com.caresync.doctor.service;

import com.caresync.auth.entity.Role;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.common.util.TimeZoneUtils;
import com.caresync.doctor.dto.LeaveRequest;
import com.caresync.doctor.dto.LeaveResponse;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.entity.Leave;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.doctor.repository.LeaveRepository;
import com.caresync.reference.entity.Clinic;
import com.caresync.reference.repository.ClinicRepository;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Manages doctors' clinic-local full-day leaves.
 */
@Service
public class LeaveService {

    private final DoctorRepository doctorRepository;
    private final ClinicRepository clinicRepository;
    private final LeaveRepository leaveRepository;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public LeaveService(
            DoctorRepository doctorRepository,
            ClinicRepository clinicRepository,
            LeaveRepository leaveRepository,
            JdbcTemplate jdbcTemplate,
            Clock clock) {
        this.doctorRepository = doctorRepository;
        this.clinicRepository = clinicRepository;
        this.leaveRepository = leaveRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<LeaveResponse> listLeaves(
            UserPrincipal caller, UUID doctorId, LocalDate from, LocalDate to) {
        assertDoctorOwnershipIfDoctor(caller, doctorId);
        if (!doctorRepository.existsById(doctorId)) {
            throw new ResourceNotFoundException("Doctor not found");
        }
        if (from != null && to != null && from.isAfter(to)) {
            throw new ValidationException("from", "from must not be after to");
        }
        List<Leave> leaves = (from == null && to == null)
                ? leaveRepository.findByDoctorIdOrderByStartDateAscIdAsc(doctorId)
                : leaveRepository.findOverlappingRange(doctorId, from, to);
        return leaves.stream().map(LeaveResponse::from).toList();
    }

    @Transactional
    public LeaveResponse createLeave(UserPrincipal caller, UUID doctorId, LeaveRequest request) {
        assertDoctorOwnershipIfDoctor(caller, doctorId);
        Doctor doctor = doctorRepository.findById(doctorId)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));
        Clinic clinic = clinicRepository.findById(doctor.getClinicId())
                .orElseThrow(() -> new ResourceNotFoundException("Clinic not found"));
        ZoneId clinicZone = TimeZoneUtils.resolveZone(clinic.getTimeZone());
        LocalDate clinicToday = TimeZoneUtils.todayInZone(clinicZone, clock);

        if (request.startDate().isBefore(clinicToday)) {
            throw new ValidationException("startDate", "startDate must not be before today in clinic time zone");
        }
        if (request.endDate().isBefore(request.startDate())) {
            throw new ValidationException("endDate", "endDate must not be before startDate");
        }

        if (leaveRepository.existsOverlappingLeave(doctorId, request.startDate(), request.endDate())) {
            throw new ConflictException(ErrorCode.LEAVE_OVERLAP, "Leave overlaps with an existing leave");
        }

        Instant rangeStartUtc = TimeZoneUtils.startOfDayUtc(request.startDate(), clinicZone);
        Instant rangeEndUtc = TimeZoneUtils.exclusiveEndOfDayUtc(request.endDate(), clinicZone);
        Integer activeAppointments = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*) FROM appointments
                WHERE doctor_id = ?
                  AND status IN ('BOOKED', 'CHECKED_IN')
                  AND slot_start >= ?
                  AND slot_start < ?
                """,
                Integer.class,
                doctorId,
                Timestamp.from(rangeStartUtc),
                Timestamp.from(rangeEndUtc));
        if (activeAppointments != null && activeAppointments > 0) {
            throw new ConflictException(
                    ErrorCode.LEAVE_HAS_BOOKED_APPOINTMENTS,
                    "Doctor has booked or checked-in appointments during this leave range");
        }

        String normalizedReason = (request.reason() == null || request.reason().isBlank())
                ? null
                : request.reason().trim();
        Leave leave = new Leave(
                UUID.randomUUID(),
                doctorId,
                request.startDate(),
                request.endDate(),
                normalizedReason,
                Instant.now(clock));
        return LeaveResponse.from(leaveRepository.saveAndFlush(leave));
    }

    @Transactional
    public void deleteLeave(UserPrincipal caller, UUID doctorId, UUID leaveId) {
        assertDoctorOwnershipIfDoctor(caller, doctorId);
        if (!doctorRepository.existsById(doctorId)) {
            throw new ResourceNotFoundException("Doctor not found");
        }
        Leave leave = leaveRepository.findByIdAndDoctorId(leaveId, doctorId)
                .orElseThrow(() -> new ResourceNotFoundException("Leave not found"));
        leaveRepository.delete(leave);
    }

    private void assertDoctorOwnershipIfDoctor(UserPrincipal caller, UUID doctorId) {
        if (caller.getRole() == Role.DOCTOR && !doctorId.equals(caller.getDoctorId())) {
            throw new ForbiddenException("Doctors can only manage their own leaves");
        }
    }
}
