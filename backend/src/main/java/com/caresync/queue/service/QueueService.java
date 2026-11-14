package com.caresync.queue.service;

import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.appointment.entity.DoctorDayCounter;
import com.caresync.appointment.entity.DoctorDayCounterId;
import com.caresync.appointment.event.QueueChangedDomainEvent;
import com.caresync.appointment.repository.AppointmentRepository;
import com.caresync.appointment.repository.DoctorDayCounterRepository;
import com.caresync.appointment.repository.QueueBoardTokenProjection;
import com.caresync.appointment.service.StatusTransitionService;
import com.caresync.auth.entity.Role;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.common.util.TimeZoneUtils;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.doctor.repository.LeaveRepository;
import com.caresync.doctor.repository.ScheduleEntryRepository;
import com.caresync.queue.dto.QueueBoardResponse;
import com.caresync.queue.dto.QueueEntry;
import com.caresync.queue.dto.QueueStateResponse;
import com.caresync.queue.dto.QueueTokenView;
import com.caresync.queue.dto.QueueUpdateMessage;
import com.caresync.reference.entity.Clinic;
import com.caresync.reference.repository.ClinicRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class QueueService {

    private static final int MAX_NEXT_PREVIEW = 5;

    private final DoctorRepository doctorRepository;
    private final ClinicRepository clinicRepository;
    private final AppointmentRepository appointmentRepository;
    private final DoctorDayCounterRepository doctorDayCounterRepository;
    private final ScheduleEntryRepository scheduleEntryRepository;
    private final LeaveRepository leaveRepository;
    private final StatusTransitionService statusTransitionService;
    private final Clock clock;

    public QueueService(
            DoctorRepository doctorRepository,
            ClinicRepository clinicRepository,
            AppointmentRepository appointmentRepository,
            DoctorDayCounterRepository doctorDayCounterRepository,
            ScheduleEntryRepository scheduleEntryRepository,
            LeaveRepository leaveRepository,
            StatusTransitionService statusTransitionService,
            Clock clock) {
        this.doctorRepository = doctorRepository;
        this.clinicRepository = clinicRepository;
        this.appointmentRepository = appointmentRepository;
        this.doctorDayCounterRepository = doctorDayCounterRepository;
        this.scheduleEntryRepository = scheduleEntryRepository;
        this.leaveRepository = leaveRepository;
        this.statusTransitionService = statusTransitionService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public QueueStateResponse getDoctorQueue(UserPrincipal caller, UUID doctorId) {
        Doctor doctor = doctorRepository.findWithUserById(doctorId)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));
        enforceQueueReadAccess(caller, doctorId);

        Clinic clinic = clinicRepository.findById(doctor.getClinicId())
                .orElseThrow(() -> new ResourceNotFoundException("Clinic not found"));
        ZoneId clinicZone = TimeZoneUtils.resolveZone(clinic.getTimeZone());
        LocalDate clinicToday = TimeZoneUtils.todayInZone(clinicZone, clock);

        return buildQueueState(doctor, clinic, clinicZone, clinicToday, Instant.now(clock));
    }

    @Transactional
    public QueueStateResponse callNext(UserPrincipal caller, UUID doctorId) {
        Doctor doctor = doctorRepository.findWithUserById(doctorId)
                .orElseThrow(() -> new ResourceNotFoundException("Doctor not found"));
        enforceCallNextAccess(caller, doctorId);

        Clinic clinic = clinicRepository.findById(doctor.getClinicId())
                .orElseThrow(() -> new ResourceNotFoundException("Clinic not found"));
        ZoneId clinicZone = TimeZoneUtils.resolveZone(clinic.getTimeZone());
        Instant now = Instant.now(clock);
        LocalDate clinicToday = TimeZoneUtils.todayInZone(clinicZone, clock);

        if (appointmentRepository.findFirstByDoctor_IdAndStatus(doctorId, AppointmentStatus.IN_CONSULTATION)
                .isPresent()) {
            throw new ConflictException(
                    ErrorCode.CONSULTATION_IN_PROGRESS,
                    "Doctor already has a patient in consultation");
        }

        Instant dayStartUtc = TimeZoneUtils.startOfDayUtc(clinicToday, clinicZone);
        Instant dayEndUtc = TimeZoneUtils.exclusiveEndOfDayUtc(clinicToday, clinicZone);
        List<Appointment> waiting = appointmentRepository.findTodayWaitingByDoctor(
                doctorId, dayStartUtc, dayEndUtc);
        if (waiting.isEmpty()) {
            throw new ConflictException(ErrorCode.QUEUE_EMPTY, "No waiting patients in queue");
        }

        Appointment nextAppointment = waiting.getFirst();
        Appointment called = statusTransitionService.moveCheckedInToInConsultation(nextAppointment, clinicZone, now);

        List<QueueEntry> remainingNext = waiting.stream()
                .skip(1)
                .limit(MAX_NEXT_PREVIEW)
                .map(QueueEntry::from)
                .toList();
        Integer lastTokenIssued = doctorDayCounterRepository
                .findById(new DoctorDayCounterId(doctorId, clinicToday))
                .map(DoctorDayCounter::getLastToken)
                .orElse(null);

        return new QueueStateResponse(
                doctor.getId(),
                doctor.getUser().getFullName(),
                clinic.getId(),
                clinic.getTimeZone(),
                clinicToday,
                QueueEntry.from(called),
                remainingNext,
                waiting.size() - 1,
                lastTokenIssued,
                now);
    }

    @Transactional(readOnly = true)
    public QueueBoardResponse getQueueBoard(UUID clinicId) {
        Clinic clinic = clinicRepository.findById(clinicId)
                .orElseThrow(() -> new ResourceNotFoundException("Clinic not found"));
        ZoneId clinicZone = TimeZoneUtils.resolveZone(clinic.getTimeZone());
        Instant now = Instant.now(clock);
        LocalDate clinicToday = TimeZoneUtils.todayInZone(clinicZone, clock);
        Instant dayStartUtc = TimeZoneUtils.startOfDayUtc(clinicToday, clinicZone);
        Instant dayEndUtc = TimeZoneUtils.exclusiveEndOfDayUtc(clinicToday, clinicZone);

        List<Doctor> clinicDoctors = doctorRepository.findByClinicIdOrderByUser_FullNameAscIdAsc(clinicId);
        if (clinicDoctors.isEmpty()) {
            return new QueueBoardResponse(
                    clinic.getId(),
                    clinic.getName(),
                    clinic.getTimeZone(),
                    clinicToday,
                    now,
                    List.of());
        }

        List<UUID> doctorIds = clinicDoctors.stream().map(Doctor::getId).toList();
        Map<UUID, Integer> lastTokensByDoctor = doctorDayCounterRepository
                .findByDoctorIdInAndCounterDate(doctorIds, clinicToday)
                .stream()
                .collect(Collectors.toMap(DoctorDayCounter::getDoctorId, DoctorDayCounter::getLastToken));
        Set<UUID> doctorsOnLeave = leaveRepository.findDoctorIdsOnLeave(doctorIds, clinicToday);
        Set<UUID> doctorsWithSchedule = scheduleEntryRepository.findDoctorIdsWithScheduleOnDay(
                doctorIds, clinicToday.getDayOfWeek());

        List<Doctor> visibleDoctors = clinicDoctors.stream()
                .filter(doctor -> {
                    Integer lastToken = lastTokensByDoctor.get(doctor.getId());
                    boolean hasIssuedTokenToday = lastToken != null && lastToken > 0;
                    boolean openToday = doctor.isActive()
                            && !doctorsOnLeave.contains(doctor.getId())
                            && doctorsWithSchedule.contains(doctor.getId());
                    return hasIssuedTokenToday || openToday;
                })
                .toList();

        Map<UUID, QueueSnapshot> snapshotsByDoctor = visibleDoctors.isEmpty()
                ? Map.of()
                : loadBoardSnapshots(
                        visibleDoctors.stream().map(Doctor::getId).toList(),
                        dayStartUtc,
                        dayEndUtc);

        List<QueueTokenView> views = visibleDoctors.stream()
                .map(doctor -> {
                    QueueSnapshot snapshot = snapshotsByDoctor.getOrDefault(
                            doctor.getId(), new QueueSnapshot(null, List.of(), 0));
                    return new QueueTokenView(
                            doctor.getId(),
                            doctor.getUser().getFullName(),
                            snapshot.nowServingToken(),
                            snapshot.nextTokens(),
                            snapshot.waitingCount(),
                            lastTokensByDoctor.get(doctor.getId()));
                })
                .toList();

        return new QueueBoardResponse(
                clinic.getId(),
                clinic.getName(),
                clinic.getTimeZone(),
                clinicToday,
                now,
                views);
    }

    @Transactional(readOnly = true)
    public QueueUpdateMessage buildQueueUpdateMessage(QueueChangedDomainEvent event) {
        Clinic clinic = clinicRepository.findById(event.clinicId())
                .orElseThrow(() -> new ResourceNotFoundException("Clinic not found"));
        ZoneId clinicZone = TimeZoneUtils.resolveZone(clinic.getTimeZone());
        Instant dayStartUtc = TimeZoneUtils.startOfDayUtc(event.clinicDate(), clinicZone);
        Instant dayEndUtc = TimeZoneUtils.exclusiveEndOfDayUtc(event.clinicDate(), clinicZone);

        QueueSnapshot snapshot = loadTokenSnapshot(event.doctorId(), dayStartUtc, dayEndUtc);
        Integer lastTokenIssued = doctorDayCounterRepository
                .findById(new DoctorDayCounterId(event.doctorId(), event.clinicDate()))
                .map(DoctorDayCounter::getLastToken)
                .orElse(null);

        return new QueueUpdateMessage(
                QueueUpdateMessage.TYPE_QUEUE_UPDATED,
                event.eventType(),
                event.doctorId(),
                event.clinicId(),
                event.clinicDate(),
                snapshot.nowServingToken(),
                snapshot.nextTokens(),
                snapshot.waitingCount(),
                lastTokenIssued,
                Instant.now(clock));
    }

    private QueueStateResponse buildQueueState(
            Doctor doctor,
            Clinic clinic,
            ZoneId clinicZone,
            LocalDate clinicToday,
            Instant now) {
        Instant dayStartUtc = TimeZoneUtils.startOfDayUtc(clinicToday, clinicZone);
        Instant dayEndUtc = TimeZoneUtils.exclusiveEndOfDayUtc(clinicToday, clinicZone);

        QueueEntry nowServing = appointmentRepository
                .findFirstByDoctor_IdAndStatus(doctor.getId(), AppointmentStatus.IN_CONSULTATION)
                .map(QueueEntry::from)
                .orElse(null);

        List<Appointment> waiting = appointmentRepository.findTodayWaitingByDoctor(
                doctor.getId(), dayStartUtc, dayEndUtc);
        List<QueueEntry> next = waiting.stream()
                .limit(MAX_NEXT_PREVIEW)
                .map(QueueEntry::from)
                .toList();
        Integer lastTokenIssued = doctorDayCounterRepository
                .findById(new DoctorDayCounterId(doctor.getId(), clinicToday))
                .map(DoctorDayCounter::getLastToken)
                .orElse(null);

        return new QueueStateResponse(
                doctor.getId(),
                doctor.getUser().getFullName(),
                clinic.getId(),
                clinic.getTimeZone(),
                clinicToday,
                nowServing,
                next,
                waiting.size(),
                lastTokenIssued,
                now);
    }

    private Map<UUID, QueueSnapshot> loadBoardSnapshots(
            List<UUID> doctorIds,
            Instant dayStartUtc,
            Instant dayEndUtc) {
        List<QueueBoardTokenProjection> rows = appointmentRepository.findBoardQueueTokens(
                doctorIds, dayStartUtc, dayEndUtc);
        Map<UUID, BoardAccumulator> accumulators = new HashMap<>();
        for (QueueBoardTokenProjection row : rows) {
            BoardAccumulator acc = accumulators.computeIfAbsent(row.doctorId(), ignored -> new BoardAccumulator());
            if (row.status() == AppointmentStatus.IN_CONSULTATION) {
                if (acc.nowServingToken == null) {
                    acc.nowServingToken = row.tokenNumber();
                }
            } else if (row.status() == AppointmentStatus.CHECKED_IN) {
                acc.waitingCount++;
                if (acc.nextTokens.size() < MAX_NEXT_PREVIEW && row.tokenNumber() != null) {
                    acc.nextTokens.add(row.tokenNumber());
                }
            }
        }
        Map<UUID, QueueSnapshot> snapshots = new HashMap<>(accumulators.size());
        accumulators.forEach((docId, acc) -> snapshots.put(
                docId, new QueueSnapshot(acc.nowServingToken, List.copyOf(acc.nextTokens), acc.waitingCount)));
        return snapshots;
    }

    private QueueSnapshot loadTokenSnapshot(UUID doctorId, Instant dayStartUtc, Instant dayEndUtc) {
        Integer nowServingToken = appointmentRepository
                .findFirstByDoctor_IdAndStatus(doctorId, AppointmentStatus.IN_CONSULTATION)
                .map(Appointment::getTokenNumber)
                .orElse(null);
        List<Appointment> waiting = appointmentRepository.findTodayWaitingByDoctor(
                doctorId, dayStartUtc, dayEndUtc);
        List<Integer> nextTokens = waiting.stream()
                .limit(MAX_NEXT_PREVIEW)
                .map(Appointment::getTokenNumber)
                .toList();
        return new QueueSnapshot(nowServingToken, nextTokens, waiting.size());
    }

    private void enforceQueueReadAccess(UserPrincipal caller, UUID doctorId) {
        Role role = caller.getRole();
        if (role == Role.ADMIN || role == Role.RECEPTIONIST) {
            return;
        }
        if (role == Role.DOCTOR && doctorId.equals(caller.getDoctorId())) {
            return;
        }
        throw new ForbiddenException("You do not have permission to view this doctor's queue");
    }

    private void enforceCallNextAccess(UserPrincipal caller, UUID doctorId) {
        Role role = caller.getRole();
        if (role == Role.RECEPTIONIST) {
            return;
        }
        if (role == Role.DOCTOR && doctorId.equals(caller.getDoctorId())) {
            return;
        }
        throw new ForbiddenException("Only the doctor or a receptionist can call the next patient");
    }

    private static final class BoardAccumulator {
        private Integer nowServingToken;
        private final List<Integer> nextTokens = new ArrayList<>(MAX_NEXT_PREVIEW);
        private int waitingCount;
    }

    private record QueueSnapshot(Integer nowServingToken, List<Integer> nextTokens, int waitingCount) {
    }
}
