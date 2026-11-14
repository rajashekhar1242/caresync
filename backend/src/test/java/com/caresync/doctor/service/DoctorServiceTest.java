package com.caresync.doctor.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.auth.repository.UserRepository;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.doctor.dto.DoctorCreateRequest;
import com.caresync.doctor.dto.DoctorResponse;
import com.caresync.doctor.dto.DoctorUpdateRequest;
import com.caresync.doctor.entity.Doctor;
import com.caresync.doctor.repository.DoctorRepository;
import com.caresync.reference.repository.ClinicRepository;
import com.caresync.reference.repository.DepartmentRepository;
import com.caresync.reference.repository.SpecializationRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class DoctorServiceTest {

    private static final Instant FIXED_NOW = Instant.parse("2026-11-12T10:00:00Z");

    @Mock
    private DoctorRepository doctorRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private SpecializationRepository specializationRepository;

    @Mock
    private ClinicRepository clinicRepository;

    @Mock
    private DepartmentRepository departmentRepository;

    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(4);
    private DoctorService doctorService;

    @BeforeEach
    void setUp() {
        doctorService = new DoctorService(
                doctorRepository,
                userRepository,
                specializationRepository,
                clinicRepository,
                departmentRepository,
                passwordEncoder,
                Clock.fixed(FIXED_NOW, ZoneOffset.UTC));
    }

    @Test
    void createDoctorPersistsUserAndDoctorInTransaction() {
        UUID specId = UUID.randomUUID();
        UUID clinicId = UUID.randomUUID();
        UUID deptId = UUID.randomUUID();

        when(specializationRepository.existsById(specId)).thenReturn(true);
        when(clinicRepository.existsById(clinicId)).thenReturn(true);
        when(departmentRepository.existsById(deptId)).thenReturn(true);
        when(userRepository.existsByEmailIgnoreCase("ravi@caresync.local")).thenReturn(false);
        when(userRepository.saveAndFlush(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
        when(doctorRepository.saveAndFlush(any(Doctor.class))).thenAnswer(inv -> inv.getArgument(0));

        DoctorResponse response = doctorService.createDoctor(new DoctorCreateRequest(
                "Dr. Ravi Kumar",
                "Ravi@CareSync.local",
                "StrongPassword!123",
                "+919876543210",
                specId,
                clinicId,
                deptId,
                "1500.00",
                15));

        assertThat(response.fullName()).isEqualTo("Dr. Ravi Kumar");
        assertThat(response.consultationFee()).isEqualTo("1500.00");
        assertThat(response.slotMinutes()).isEqualTo(15);
        assertThat(response.active()).isTrue();

        ArgumentCaptor<User> userCaptor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).saveAndFlush(userCaptor.capture());
        assertThat(userCaptor.getValue().getEmail()).isEqualTo("ravi@caresync.local");
        assertThat(userCaptor.getValue().getRole()).isEqualTo(Role.DOCTOR);
        assertThat(passwordEncoder.matches("StrongPassword!123", userCaptor.getValue().getPasswordHash())).isTrue();
    }

    @Test
    void createDoctorRejectsInvalidSlotMultipleMissingReferenceAndDuplicateEmail() {
        UUID specId = UUID.randomUUID();
        UUID clinicId = UUID.randomUUID();
        UUID deptId = UUID.randomUUID();

        assertThatThrownBy(() -> doctorService.createDoctor(new DoctorCreateRequest(
                "Dr. Test", "doc@caresync.local", "Password!123", null, specId, clinicId, deptId, "500.00", 17)))
                .isInstanceOf(ValidationException.class);

        when(specializationRepository.existsById(specId)).thenReturn(false);
        assertThatThrownBy(() -> doctorService.createDoctor(new DoctorCreateRequest(
                "Dr. Test", "doc@caresync.local", "Password!123", null, specId, clinicId, deptId, "500.00", 15)))
                .isInstanceOf(ResourceNotFoundException.class);

        when(specializationRepository.existsById(specId)).thenReturn(true);
        when(clinicRepository.existsById(clinicId)).thenReturn(true);
        when(departmentRepository.existsById(deptId)).thenReturn(true);
        when(userRepository.existsByEmailIgnoreCase("doc@caresync.local")).thenReturn(true);

        assertThatThrownBy(() -> doctorService.createDoctor(new DoctorCreateRequest(
                "Dr. Test", "doc@caresync.local", "Password!123", null, specId, clinicId, deptId, "500.00", 15)))
                .isInstanceOf(ConflictException.class)
                .satisfies(ex -> assertThat(((ConflictException) ex).getErrorCode())
                        .isEqualTo(ErrorCode.EMAIL_ALREADY_EXISTS));
    }

    @Test
    void getDoctorHidesInactiveDoctorsFromPatientsAndUpdatesAllFields() {
        UUID docId = UUID.randomUUID();
        User docUser = new User(UUID.randomUUID(), "d@caresync.local", "hash", "Dr. Old", Role.DOCTOR, FIXED_NOW);
        Doctor inactive = new Doctor(
                docId, docUser, UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                null, new BigDecimal("800.00"), 15, false);
        when(doctorRepository.findWithUserById(docId)).thenReturn(Optional.of(inactive));

        UserPrincipal patient = new UserPrincipal(
                UUID.randomUUID(), "pat@caresync.local", "Pat", Role.PATIENT, UUID.randomUUID(), null);
        UserPrincipal receptionist = new UserPrincipal(
                UUID.randomUUID(), "rec@caresync.local", "Rec", Role.RECEPTIONIST, null, null);

        assertThatThrownBy(() -> doctorService.getDoctor(patient, docId))
                .isInstanceOf(ResourceNotFoundException.class);

        assertThat(doctorService.getDoctor(receptionist, docId).active()).isFalse();

        UUID newSpec = UUID.randomUUID();
        UUID newClinic = UUID.randomUUID();
        UUID newDept = UUID.randomUUID();
        when(specializationRepository.existsById(newSpec)).thenReturn(true);
        when(clinicRepository.existsById(newClinic)).thenReturn(true);
        when(departmentRepository.existsById(newDept)).thenReturn(true);
        when(doctorRepository.saveAndFlush(inactive)).thenReturn(inactive);

        DoctorResponse updated = doctorService.updateDoctor(docId, new DoctorUpdateRequest(
                "Dr. Updated", "+919999988888", newSpec, newClinic, newDept, "0.00", 30, true));
        assertThat(updated.fullName()).isEqualTo("Dr. Updated");
        assertThat(updated.consultationFee()).isEqualTo("0.00");
        assertThat(updated.slotMinutes()).isEqualTo(30);
        assertThat(updated.active()).isTrue();
    }
}
