package com.caresync.doctor.service;

import com.caresync.auth.entity.Role;
import com.caresync.common.dto.FieldError;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.doctor.dto.ScheduleEntryDto;
import com.caresync.doctor.dto.WeeklyScheduleRequest;
import com.caresync.doctor.dto.WeeklyScheduleResponse;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.entity.ScheduleEntry;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.doctor.repository.ScheduleEntryRepository;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Manages doctors' weekly clinic-local schedule entries.
 */
@Service
public class ScheduleService {

    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    private final DoctorRepository doctorRepository;
    private final ScheduleEntryRepository scheduleEntryRepository;

    public ScheduleService(DoctorRepository doctorRepository, ScheduleEntryRepository scheduleEntryRepository) {
        this.doctorRepository = doctorRepository;
        this.scheduleEntryRepository = scheduleEntryRepository;
    }

    @Transactional(readOnly = true)
    public WeeklyScheduleResponse getSchedule(UserPrincipal caller, UUID doctorId) {
        assertDoctorOwnershipIfDoctor(caller, doctorId);
        if (!doctorRepository.existsById(doctorId)) {
            throw new ResourceNotFoundException("Doctor not found");
        }
        List<ScheduleEntryDto> entries = scheduleEntryRepository
                .findByDoctorIdOrderByDayOfWeekAscStartTimeAsc(doctorId)
                .stream()
                .map(this::toDto)
                .toList();
        return new WeeklyScheduleResponse(doctorId, entries);
    }

    @Transactional
    public WeeklyScheduleResponse replaceSchedule(
            UserPrincipal caller, UUID doctorId, WeeklyScheduleRequest request) {
        assertDoctorOwnershipIfDoctor(caller, doctorId);
        Doctor doctor = doctorRepository.findById(doctorId)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));

        List<ScheduleEntryDto> rawEntries = request.entries() == null ? List.of() : request.entries();
        List<ParsedEntry> parsed = validateSchedule(rawEntries, doctor.getSlotMinutes());

        scheduleEntryRepository.deleteAllByDoctorId(doctorId);
        List<ScheduleEntry> saved = parsed.stream()
                .sorted(Comparator.comparing(ParsedEntry::dayOfWeek).thenComparing(ParsedEntry::startTime))
                .map(p -> new ScheduleEntry(UUID.randomUUID(), doctorId, p.dayOfWeek(), p.startTime(), p.endTime()))
                .toList();
        if (!saved.isEmpty()) {
            scheduleEntryRepository.saveAll(saved);
        }

        return new WeeklyScheduleResponse(
                doctorId,
                saved.stream().map(this::toDto).toList());
    }

    private void assertDoctorOwnershipIfDoctor(UserPrincipal caller, UUID doctorId) {
        if (caller.getRole() == Role.DOCTOR && !doctorId.equals(caller.getDoctorId())) {
            throw new ForbiddenException("Doctors can only manage their own schedule");
        }
    }

    private List<ParsedEntry> validateSchedule(List<ScheduleEntryDto> entries, int slotMinutes) {
        if (entries.size() > 28) {
            throw new ValidationException(
                    ErrorCode.INVALID_SCHEDULE,
                    "Weekly schedule cannot exceed 28 entries",
                    List.of(new FieldError("entries", "must contain at most 28 entries")));
        }

        List<FieldError> fieldErrors = new ArrayList<>();
        List<ParsedEntry> parsed = new ArrayList<>(entries.size());
        Map<DayOfWeek, List<ParsedEntry>> byDay = new EnumMap<>(DayOfWeek.class);

        for (int i = 0; i < entries.size(); i++) {
            ScheduleEntryDto dto = entries.get(i);
            LocalTime start = LocalTime.parse(dto.startTime(), HH_MM);
            LocalTime end = LocalTime.parse(dto.endTime(), HH_MM);
            String prefix = "entries[" + i + "]";

            if (!start.isBefore(end)) {
                fieldErrors.add(new FieldError(prefix + ".endTime", "endTime must be after startTime"));
                continue;
            }
            long durationMinutes = Duration.between(start, end).toMinutes();
            if (durationMinutes < slotMinutes) {
                fieldErrors.add(new FieldError(
                        prefix, "duration must be at least slotMinutes (" + slotMinutes + " minutes)"));
                continue;
            }
            ParsedEntry item = new ParsedEntry(i, dto.dayOfWeek(), start, end);
            parsed.add(item);
            byDay.computeIfAbsent(dto.dayOfWeek(), d -> new ArrayList<>()).add(item);
        }

        for (Map.Entry<DayOfWeek, List<ParsedEntry>> dayEntries : byDay.entrySet()) {
            List<ParsedEntry> sorted = dayEntries.getValue().stream()
                    .sorted(Comparator.comparing(ParsedEntry::startTime).thenComparing(ParsedEntry::endTime))
                    .toList();
            for (int i = 1; i < sorted.size(); i++) {
                ParsedEntry prev = sorted.get(i - 1);
                ParsedEntry curr = sorted.get(i);
                if (curr.startTime().isBefore(prev.endTime())) {
                    fieldErrors.add(new FieldError(
                            "entries[" + curr.index() + "]",
                            "overlaps with another range on " + dayEntries.getKey()));
                }
            }
        }

        if (!fieldErrors.isEmpty()) {
            throw new ValidationException(ErrorCode.INVALID_SCHEDULE, "Invalid weekly schedule", fieldErrors);
        }
        return parsed;
    }

    private ScheduleEntryDto toDto(ScheduleEntry entry) {
        return new ScheduleEntryDto(
                entry.getDayOfWeek(),
                entry.getStartTime().format(HH_MM),
                entry.getEndTime().format(HH_MM));
    }

    private record ParsedEntry(int index, DayOfWeek dayOfWeek, LocalTime startTime, LocalTime endTime) {
    }
}
