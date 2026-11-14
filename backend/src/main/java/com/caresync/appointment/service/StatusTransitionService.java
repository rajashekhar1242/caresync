package com.caresync.appointment.service;

import com.caresync.appointment.dto.AppointmentResponse;
import com.caresync.appointment.dto.AppointmentStatusUpdateRequest;
import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.appointment.event.QueueChangedDomainEvent;
import com.caresync.appointment.event.QueueEventType;
import com.caresync.appointment.repository.AppointmentRepository;
import com.caresync.appointment.repository.DoctorDayCounterRepository;
import com.caresync.auth.entity.Role;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.common.util.TimeZoneUtils;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class StatusTransitionService {

    private static final Duration CANCELLATION_LEAD_TIME = Duration.ofHours(2);

    private final AppointmentRepository appointmentRepository;
    private final DoctorDayCounterRepository doctorDayCounterRepository;
    private final ConsultationLifecyclePort consultationLifecyclePort;
    private final AppointmentBillingPort appointmentBillingPort;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    public StatusTransitionService(
            AppointmentRepository appointmentRepository,
            DoctorDayCounterRepository doctorDayCounterRepository,
            ConsultationLifecyclePort consultationLifecyclePort,
            AppointmentBillingPort appointmentBillingPort,
            ApplicationEventPublisher eventPublisher,
            Clock clock) {
        this.appointmentRepository = appointmentRepository;
        this.doctorDayCounterRepository = doctorDayCounterRepository;
        this.consultationLifecyclePort = consultationLifecyclePort;
        this.appointmentBillingPort = appointmentBillingPort;
        this.eventPublisher = eventPublisher;
        this.clock = clock;
    }

    /**
     * Applies an appointment state transition following the documented check order:
     * 404 -> 403 (role & ownership) -> 409 ILLEGAL_STATE_TRANSITION -> transition-specific rules.
     */
    @Transactional
    public AppointmentResponse updateStatus(
            UserPrincipal caller,
            UUID appointmentId,
            AppointmentStatusUpdateRequest request) {
        Appointment appointment = appointmentRepository.findWithDetailsById(appointmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Appointment not found"));

        AppointmentStatus current = appointment.getStatus();
        AppointmentStatus target = request.status();

        enforceRoleAndOwnershipForTarget(caller, appointment, target);
        validateLegalTransition(current, target);

        Instant now = Instant.now(clock);
        ZoneId clinicZone = TimeZoneUtils.resolveZone(appointment.getClinic().getTimeZone());

        Appointment saved;
        try {
            saved = switch (target) {
                case CHECKED_IN -> checkIn(appointment, clinicZone, now);
                case CANCELLED -> cancel(appointment, request.reason(), now);
                case NO_SHOW -> markNoShow(appointment, now);
                case IN_CONSULTATION -> moveCheckedInToInConsultation(appointment, clinicZone, now);
                case COMPLETED -> complete(appointment, clinicZone, now);
                case BOOKED -> throw new ConflictException(
                        ErrorCode.ILLEGAL_STATE_TRANSITION,
                        "Cannot transition appointment back to BOOKED");
            };
        } catch (OptimisticLockingFailureException ex) {
            throw new ConflictException(
                    ErrorCode.ILLEGAL_STATE_TRANSITION,
                    "Appointment status was modified concurrently");
        }

        return AppointmentResponse.from(saved);
    }

    /**
     * Moves a {@code CHECKED_IN} appointment into {@code IN_CONSULTATION}.
     * Shared with queue {@code call-next}.
     */
    @Transactional
    public Appointment moveCheckedInToInConsultation(Appointment appointment, ZoneId clinicZone, Instant now) {
        UUID doctorId = appointment.getDoctor().getId();
        if (appointmentRepository.existsByDoctor_IdAndStatusAndIdNot(
                doctorId, AppointmentStatus.IN_CONSULTATION, appointment.getId())) {
            throw new ConflictException(
                    ErrorCode.CONSULTATION_IN_PROGRESS,
                    "Doctor already has an appointment in consultation");
        }

        appointment.setStatus(AppointmentStatus.IN_CONSULTATION);
        appointment.setUpdatedAt(now);

        Appointment saved;
        try {
            saved = appointmentRepository.saveAndFlush(appointment);
        } catch (DataIntegrityViolationException | OptimisticLockingFailureException ex) {
            throw new ConflictException(
                    ErrorCode.CONSULTATION_IN_PROGRESS,
                    "Doctor already has an appointment in consultation");
        }

        LocalDate queueDate = appointment.getCheckedInAt() != null
                ? TimeZoneUtils.toLocalDate(appointment.getCheckedInAt(), clinicZone)
                : TimeZoneUtils.todayInZone(clinicZone, clock);
        eventPublisher.publishEvent(new QueueChangedDomainEvent(
                doctorId,
                appointment.getClinic().getId(),
                queueDate,
                QueueEventType.PATIENT_CALLED));
        return saved;
    }

    private Appointment checkIn(Appointment appointment, ZoneId clinicZone, Instant now) {
        LocalDate slotDate = TimeZoneUtils.toLocalDate(appointment.getSlotStart(), clinicZone);
        LocalDate clinicToday = TimeZoneUtils.todayInZone(clinicZone, clock);
        if (clinicToday.isBefore(slotDate)) {
            throw new ConflictException(
                    ErrorCode.TRANSITION_TOO_EARLY,
                    "Check-in is not allowed before the appointment's clinic-local date");
        }

        int tokenNumber = doctorDayCounterRepository.incrementAndGetNextToken(
                appointment.getDoctor().getId(), clinicToday);
        appointment.setTokenNumber(tokenNumber);
        appointment.setCheckedInAt(now);
        appointment.setStatus(AppointmentStatus.CHECKED_IN);
        appointment.setUpdatedAt(now);

        Appointment saved = appointmentRepository.saveAndFlush(appointment);
        eventPublisher.publishEvent(new QueueChangedDomainEvent(
                appointment.getDoctor().getId(),
                appointment.getClinic().getId(),
                clinicToday,
                QueueEventType.TOKEN_ISSUED));
        return saved;
    }

    private Appointment cancel(Appointment appointment, String rawReason, Instant now) {
        if (appointment.getSlotStart().isBefore(now.plus(CANCELLATION_LEAD_TIME))) {
            throw new ConflictException(
                    ErrorCode.CANCELLATION_WINDOW_CLOSED,
                    "Appointments must be cancelled at least 2 hours before slotStart");
        }
        String normalizedReason = rawReason == null || rawReason.trim().isEmpty() ? null : rawReason.trim();
        appointment.setStatus(AppointmentStatus.CANCELLED);
        appointment.setCancellationReason(normalizedReason);
        appointment.setUpdatedAt(now);
        return appointmentRepository.saveAndFlush(appointment);
    }

    private Appointment markNoShow(Appointment appointment, Instant now) {
        if (now.isBefore(appointment.getSlotStart())) {
            throw new ConflictException(
                    ErrorCode.TRANSITION_TOO_EARLY,
                    "Cannot mark appointment NO_SHOW before slotStart");
        }
        appointment.setStatus(AppointmentStatus.NO_SHOW);
        appointment.setUpdatedAt(now);
        return appointmentRepository.saveAndFlush(appointment);
    }

    private Appointment complete(Appointment appointment, ZoneId clinicZone, Instant now) {
        consultationLifecyclePort.verifyReadyAndFinalize(appointment.getId(), now);

        appointment.setStatus(AppointmentStatus.COMPLETED);
        appointment.setUpdatedAt(now);
        Appointment saved = appointmentRepository.saveAndFlush(appointment);

        appointmentBillingPort.createConsultationInvoice(saved, now);

        LocalDate queueDate = appointment.getCheckedInAt() != null
                ? TimeZoneUtils.toLocalDate(appointment.getCheckedInAt(), clinicZone)
                : TimeZoneUtils.todayInZone(clinicZone, clock);
        eventPublisher.publishEvent(new QueueChangedDomainEvent(
                appointment.getDoctor().getId(),
                appointment.getClinic().getId(),
                queueDate,
                QueueEventType.CONSULTATION_COMPLETED));
        return saved;
    }

    private void enforceRoleAndOwnershipForTarget(
            UserPrincipal caller,
            Appointment appointment,
            AppointmentStatus target) {
        Role role = caller.getRole();
        boolean isOwnDoctor = role == Role.DOCTOR && appointment.getDoctor().getId().equals(caller.getDoctorId());
        boolean isOwnPatient = role == Role.PATIENT && appointment.getPatient().getId().equals(caller.getPatientId());

        if (target == AppointmentStatus.BOOKED) {
            if (role == Role.ADMIN || role == Role.RECEPTIONIST || isOwnDoctor || isOwnPatient) {
                return;
            }
            throw new ForbiddenException("You do not have permission to update this appointment");
        }

        switch (target) {
            case CHECKED_IN, NO_SHOW -> {
                if (role != Role.ADMIN && role != Role.RECEPTIONIST) {
                    throw new ForbiddenException("Only receptionists or admins can set status to " + target);
                }
            }
            case IN_CONSULTATION, COMPLETED -> {
                if (!isOwnDoctor) {
                    throw new ForbiddenException("Only the appointment's doctor can set status to " + target);
                }
            }
            case CANCELLED -> {
                if (role != Role.ADMIN && role != Role.RECEPTIONIST && !isOwnDoctor && !isOwnPatient) {
                    throw new ForbiddenException("You do not have permission to cancel this appointment");
                }
            }
            default -> throw new ForbiddenException("Unsupported target status");
        }
    }

    private void validateLegalTransition(AppointmentStatus from, AppointmentStatus to) {
        boolean legal = switch (from) {
            case BOOKED -> to == AppointmentStatus.CHECKED_IN
                    || to == AppointmentStatus.CANCELLED
                    || to == AppointmentStatus.NO_SHOW;
            case CHECKED_IN -> to == AppointmentStatus.IN_CONSULTATION;
            case IN_CONSULTATION -> to == AppointmentStatus.COMPLETED;
            case COMPLETED, CANCELLED, NO_SHOW -> false;
        };
        if (!legal) {
            throw new ConflictException(
                    ErrorCode.ILLEGAL_STATE_TRANSITION,
                    "Illegal appointment state transition from " + from + " to " + to);
        }
    }
}
