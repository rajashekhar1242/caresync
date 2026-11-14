package com.caresync.appointment.service;

import com.caresync.appointment.dto.SlotClosedReason;
import com.caresync.appointment.dto.SlotListResponse;
import com.caresync.appointment.dto.SlotResponse;
import com.caresync.auth.entity.Role;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.common.util.TimeZoneUtils;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.entity.ScheduleEntry;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.doctor.repository.LeaveRepository;
import com.caresync.doctor.repository.ScheduleEntryRepository;
import com.caresync.reference.entity.Clinic;
import com.caresync.reference.repository.ClinicRepository;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Generates clinic-local daily appointment slots in UTC from a doctor's weekly schedule,
 * leave calendar, booking window (today .. today+30d), and active appointments.
 */
@Service
public class SlotService {

    public static final int BOOKING_WINDOW_DAYS = 30;

    private final DoctorRepository doctorRepository;
    private final ClinicRepository clinicRepository;
    private final ScheduleEntryRepository scheduleEntryRepository;
    private final LeaveRepository leaveRepository;
    private final JdbcTemplate jdbcTemplate;
    private final Clock clock;

    public SlotService(
            DoctorRepository doctorRepository,
            ClinicRepository clinicRepository,
            ScheduleEntryRepository scheduleEntryRepository,
            LeaveRepository leaveRepository,
            JdbcTemplate jdbcTemplate,
            Clock clock) {
        this.doctorRepository = doctorRepository;
        this.clinicRepository = clinicRepository;
        this.scheduleEntryRepository = scheduleEntryRepository;
        this.leaveRepository = leaveRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public SlotListResponse listDoctorSlots(UserPrincipal caller, UUID doctorId, LocalDate date) {
        Doctor doctor = doctorRepository.findById(doctorId)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));
        if (caller.getRole() == Role.PATIENT && !doctor.isActive()) {
            throw new ResourceNotFoundException("Doctor not found");
        }

        Clinic clinic = clinicRepository.findById(doctor.getClinicId())
                .orElseThrow(() -> new ResourceNotFoundException("Clinic not found"));
        ZoneId clinicZone = TimeZoneUtils.resolveZone(clinic.getTimeZone());
        LocalDate clinicToday = TimeZoneUtils.todayInZone(clinicZone, clock);

        if (!doctor.isActive()) {
            return closedResponse(doctor, clinic, date, SlotClosedReason.DOCTOR_INACTIVE);
        }
        if (date.isBefore(clinicToday) || date.isAfter(clinicToday.plusDays(BOOKING_WINDOW_DAYS))) {
            return closedResponse(doctor, clinic, date, SlotClosedReason.OUTSIDE_BOOKING_WINDOW);
        }
        if (leaveRepository.existsOverlappingLeave(doctorId, date, date)) {
            return closedResponse(doctor, clinic, date, SlotClosedReason.ON_LEAVE);
        }

        List<ScheduleEntry> dayEntries = scheduleEntryRepository
                .findByDoctorIdAndDayOfWeekOrderByStartTimeAsc(doctorId, date.getDayOfWeek());
        if (dayEntries.isEmpty()) {
            return closedResponse(doctor, clinic, date, SlotClosedReason.NO_SCHEDULE);
        }

        Set<Instant> occupiedStarts = findOccupiedSlotStarts(doctorId, date, clinicZone);
        Instant now = Instant.now(clock);
        int slotMinutes = doctor.getSlotMinutes();
        long slotSeconds = slotMinutes * 60L;

        List<SlotResponse> slots = new ArrayList<>();
        for (ScheduleEntry entry : dayEntries) {
            int cursorMin = entry.getStartTime().toSecondOfDay() / 60;
            int endMin = entry.getEndTime().toSecondOfDay() / 60;
            while (cursorMin + slotMinutes <= endMin) {
                LocalTime startLocal = LocalTime.ofSecondOfDay(cursorMin * 60L);
                Optional<Instant> startUtcOpt = TimeZoneUtils.resolveSlotStartUtc(date, startLocal, clinicZone);
                if (startUtcOpt.isPresent()) {
                    Instant startUtc = startUtcOpt.get();
                    Instant endUtc = startUtc.plusSeconds(slotSeconds);
                    boolean available = startUtc.isAfter(now) && !occupiedStarts.contains(startUtc);
                    slots.add(new SlotResponse(startUtc, endUtc, available));
                }
                cursorMin += slotMinutes;
            }
        }

        return new SlotListResponse(
                doctor.getId(),
                clinic.getId(),
                clinic.getTimeZone(),
                date,
                slotMinutes,
                null,
                slots);
    }

    /**
     * Checks whether {@code slotStart} exactly matches a generated slot start in the doctor's weekly schedule.
     */
    @Transactional(readOnly = true)
    public boolean isValidScheduledSlotStart(Doctor doctor, ZoneId clinicZone, Instant slotStart) {
        LocalDate clinicDate = TimeZoneUtils.toLocalDate(slotStart, clinicZone);
        List<ScheduleEntry> dayEntries = scheduleEntryRepository
                .findByDoctorIdAndDayOfWeekOrderByStartTimeAsc(doctor.getId(), clinicDate.getDayOfWeek());
        int slotMinutes = doctor.getSlotMinutes();
        for (ScheduleEntry entry : dayEntries) {
            int cursorMin = entry.getStartTime().toSecondOfDay() / 60;
            int endMin = entry.getEndTime().toSecondOfDay() / 60;
            while (cursorMin + slotMinutes <= endMin) {
                LocalTime startLocal = LocalTime.ofSecondOfDay(cursorMin * 60L);
                Optional<Instant> candidate = TimeZoneUtils.resolveSlotStartUtc(clinicDate, startLocal, clinicZone);
                if (candidate.isPresent() && candidate.get().equals(slotStart)) {
                    return true;
                }
                cursorMin += slotMinutes;
            }
        }
        return false;
    }

    private Set<Instant> findOccupiedSlotStarts(UUID doctorId, LocalDate clinicDate, ZoneId clinicZone) {
        Instant dayStartUtc = TimeZoneUtils.startOfDayUtc(clinicDate, clinicZone);
        Instant dayEndUtc = TimeZoneUtils.exclusiveEndOfDayUtc(clinicDate, clinicZone);
        List<Instant> instants = jdbcTemplate.query(
                """
                SELECT slot_start FROM appointments
                WHERE doctor_id = ?
                  AND status <> 'CANCELLED'
                  AND slot_start >= ?
                  AND slot_start < ?
                """,
                (rs, rowNum) -> rs.getTimestamp("slot_start").toInstant(),
                doctorId,
                Timestamp.from(dayStartUtc),
                Timestamp.from(dayEndUtc));
        return new HashSet<>(instants);
    }

    private SlotListResponse closedResponse(
            Doctor doctor, Clinic clinic, LocalDate date, SlotClosedReason reason) {
        return new SlotListResponse(
                doctor.getId(),
                clinic.getId(),
                clinic.getTimeZone(),
                date,
                doctor.getSlotMinutes(),
                reason,
                List.of());
    }
}
