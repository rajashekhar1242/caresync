package com.caresync.appointment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.caresync.appointment.dto.AppointmentCreateRequest;
import com.caresync.appointment.dto.AppointmentResponse;
import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.repository.AppointmentRepository;
import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.doctor.repository.LeaveRepository;
import com.caresync.patient.entity.Patient;
import com.caresync.patient.repository.PatientRepository;
import com.caresync.reference.entity.Clinic;
import com.caresync.reference.repository.ClinicRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AppointmentServiceTest {

    // 2026-06-10 04:00:00Z = 09:30 IST
    private static final Instant NOW = Instant.parse("2026-06-10T04:00:00Z");

    private AppointmentRepository appointmentRepository;
    private DoctorRepository doctorRepository;
    private PatientRepository patientRepository;
    private ClinicRepository clinicRepository;
    private LeaveRepository leaveRepository;
    private SlotService slotService;
    private AppointmentService appointmentService;

    private UUID doctorId;
    private UUID patientId;
    private UUID clinicId;
    private Doctor doctor;
    private Patient patient;
    private Clinic clinic;

    @BeforeEach
    void setUp() {
        appointmentRepository = mock(AppointmentRepository.class);
        doctorRepository = mock(DoctorRepository.class);
        patientRepository = mock(PatientRepository.class);
        clinicRepository = mock(ClinicRepository.class);
        leaveRepository = mock(LeaveRepository.class);
        slotService = mock(SlotService.class);
        appointmentService = new AppointmentService(
                appointmentRepository,
                doctorRepository,
                patientRepository,
                clinicRepository,
                leaveRepository,
                slotService,
                Clock.fixed(NOW, ZoneOffset.UTC));

        doctorId = UUID.randomUUID();
        patientId = UUID.randomUUID();
        clinicId = UUID.randomUUID();
        User docUser = new User(UUID.randomUUID(), "doc@caresync.local", "hash", "Dr. Rao", Role.DOCTOR, NOW);
        doctor = new Doctor(
                doctorId, docUser, UUID.randomUUID(), clinicId, UUID.randomUUID(),
                null, new BigDecimal("500.00"), 15, true);
        patient = new Patient(
                patientId, null, "Asha", null, null, "+919876543210", null, null, List.of(), NOW, NOW);
        clinic = new Clinic(clinicId, "Main", "Addr", "Asia/Kolkata");

        when(doctorRepository.findWithUserById(doctorId)).thenReturn(Optional.of(doctor));
        when(patientRepository.findById(patientId)).thenReturn(Optional.of(patient));
        when(clinicRepository.findById(clinicId)).thenReturn(Optional.of(clinic));
    }

    @Test
    void enforcesRoleOwnershipAndBookingValidationOrder() {
        UserPrincipal doctorCaller = new UserPrincipal(
                UUID.randomUUID(), "doc@caresync.local", "Dr", Role.DOCTOR, null, doctorId);
        Instant validSlot = Instant.parse("2026-06-11T04:30:00Z");

        assertThatThrownBy(() -> appointmentService.bookAppointment(
                doctorCaller, new AppointmentCreateRequest(doctorId, patientId, validSlot, null)))
                .isInstanceOf(ForbiddenException.class);

        UserPrincipal otherPatient = new UserPrincipal(
                UUID.randomUUID(), "p2@caresync.local", "Other", Role.PATIENT, UUID.randomUUID(), null);
        assertThatThrownBy(() -> appointmentService.bookAppointment(
                otherPatient, new AppointmentCreateRequest(doctorId, patientId, validSlot, null)))
                .isInstanceOf(ForbiddenException.class);

        UserPrincipal ownPatient = new UserPrincipal(
                UUID.randomUUID(), "p1@caresync.local", "Asha", Role.PATIENT, patientId, null);

        // Step 2: INVALID_SLOT checked even before window/availability
        when(slotService.isValidScheduledSlotStart(eq(doctor), any(), eq(validSlot))).thenReturn(false);
        assertThatThrownBy(() -> appointmentService.bookAppointment(
                ownPatient, new AppointmentCreateRequest(doctorId, patientId, validSlot, null)))
                .isInstanceOf(ValidationException.class)
                .satisfies(ex -> {
                    ValidationException ve = (ValidationException) ex;
                    assertThat(ve.getErrorCode()).isEqualTo(ErrorCode.INVALID_SLOT);
                    assertThat(ve.getFieldErrors()).extracting("field").containsExactly("slotStart");
                });

        // Step 3: OUTSIDE_BOOKING_WINDOW (past slot)
        Instant pastSlot = NOW.minusSeconds(60);
        when(slotService.isValidScheduledSlotStart(eq(doctor), any(), eq(pastSlot))).thenReturn(true);
        assertThatThrownBy(() -> appointmentService.bookAppointment(
                ownPatient, new AppointmentCreateRequest(doctorId, patientId, pastSlot, null)))
                .isInstanceOf(ValidationException.class)
                .satisfies(ex -> assertThat(((ValidationException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.OUTSIDE_BOOKING_WINDOW));

        // Step 4: DOCTOR_UNAVAILABLE when on leave
        when(slotService.isValidScheduledSlotStart(eq(doctor), any(), eq(validSlot))).thenReturn(true);
        when(leaveRepository.existsOverlappingLeave(eq(doctorId), any(), any())).thenReturn(true);
        assertThatThrownBy(() -> appointmentService.bookAppointment(
                ownPatient, new AppointmentCreateRequest(doctorId, patientId, validSlot, null)))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.DOCTOR_UNAVAILABLE));

        // Step 5: SLOT_ALREADY_BOOKED
        when(leaveRepository.existsOverlappingLeave(eq(doctorId), any(), any())).thenReturn(false);
        when(appointmentRepository.existsActiveAtSlot(doctorId, validSlot)).thenReturn(true);
        assertThatThrownBy(() -> appointmentService.bookAppointment(
                ownPatient, new AppointmentCreateRequest(doctorId, patientId, validSlot, null)))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.SLOT_ALREADY_BOOKED));

        // Success
        when(appointmentRepository.existsActiveAtSlot(doctorId, validSlot)).thenReturn(false);
        when(appointmentRepository.saveAndFlush(any(Appointment.class))).thenAnswer(inv -> inv.getArgument(0));
        AppointmentResponse booked = appointmentService.bookAppointment(
                ownPatient, new AppointmentCreateRequest(doctorId, patientId, validSlot, "  Fever  "));
        assertThat(booked.slotEnd()).isEqualTo(validSlot.plusSeconds(900));
        assertThat(booked.reason()).isEqualTo("Fever");
    }

    @Test
    void enforcesListScopingForDoctorAndPatientAndValidatesDateRange() {
        UserPrincipal doctorCaller = new UserPrincipal(
                UUID.randomUUID(), "doc@caresync.local", "Dr", Role.DOCTOR, null, doctorId);
        assertThatThrownBy(() -> appointmentService.listAppointments(
                doctorCaller, UUID.randomUUID(), null, null, null, null, 0, 20, "slotStart,asc"))
                .isInstanceOf(ForbiddenException.class);

        UserPrincipal patientCaller = new UserPrincipal(
                UUID.randomUUID(), "p@caresync.local", "Asha", Role.PATIENT, patientId, null);
        assertThatThrownBy(() -> appointmentService.listAppointments(
                patientCaller, null, UUID.randomUUID(), null, null, null, 0, 20, "slotStart,asc"))
                .isInstanceOf(ForbiddenException.class);

        UserPrincipal admin = new UserPrincipal(
                UUID.randomUUID(), "a@caresync.local", "Admin", Role.ADMIN, null, null);
        assertThatThrownBy(() -> appointmentService.listAppointments(
                admin, null, null, null, NOW, NOW, 0, 20, "slotStart,asc"))
                .isInstanceOf(ValidationException.class);
    }
}
