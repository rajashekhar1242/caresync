package com.caresync.patient.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.service.AuditService;
import com.caresync.auth.entity.Role;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.patient.dto.PatientRequest;
import com.caresync.patient.dto.PatientResponse;
import com.caresync.patient.dto.PatientSummary;
import com.caresync.patient.entity.Gender;
import com.caresync.patient.entity.Patient;
import com.caresync.patient.repository.PatientRepository;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;

class PatientServiceTest {

    private static final Instant NOW = Instant.parse("2026-06-10T10:00:00Z");

    private PatientRepository patientRepository;
    private AuditService auditService;
    private DoctorPatientScopePort doctorPatientScopePort;
    private PatientService patientService;

    @BeforeEach
    void setUp() {
        patientRepository = mock(PatientRepository.class);
        auditService = mock(AuditService.class);
        doctorPatientScopePort = mock(DoctorPatientScopePort.class);
        patientService = new PatientService(
                patientRepository,
                auditService,
                doctorPatientScopePort,
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void createPatientTrimsFieldsAndDeduplicatesAllergiesIgnoringCase() {
        when(patientRepository.saveAndFlush(any(Patient.class))).thenAnswer(inv -> inv.getArgument(0));

        PatientRequest request = new PatientRequest(
                "  Asha Mehta  ",
                LocalDate.of(1994, 6, 15),
                Gender.FEMALE,
                "+919876543210",
                "  Asha@Example.COM ",
                " 12 MG Road ",
                List.of("  Penicillin ", "penicillin", "Peanuts", "PEANUTS", "Sulfa"));

        PatientResponse response = patientService.createPatient(request);

        assertThat(response.userId()).isNull();
        assertThat(response.fullName()).isEqualTo("Asha Mehta");
        assertThat(response.email()).isEqualTo("asha@example.com");
        assertThat(response.address()).isEqualTo("12 MG Road");
        assertThat(response.allergies()).containsExactly("Penicillin", "Peanuts", "Sulfa");
        verify(auditService, never()).recordCurrentUser(any(), any(), any(), any());
    }

    @Test
    void rejectsFutureDateOfBirth() {
        PatientRequest request = new PatientRequest(
                "Future Baby",
                LocalDate.of(2026, 6, 11),
                Gender.OTHER,
                "+919876543210",
                null,
                null,
                List.of());

        assertThatThrownBy(() -> patientService.createPatient(request))
                .isInstanceOf(ValidationException.class)
                .satisfies(ex -> {
                    ValidationException ve = (ValidationException) ex;
                    assertThat(ve.getFieldErrors()).anySatisfy(err -> {
                        assertThat(err.field()).isEqualTo("dateOfBirth");
                        assertThat(err.message()).contains("future");
                    });
                });
    }

    @Test
    void getPatientEnforcesDoctorOwnPatientsAndWritesAuditLog() {
        UUID patientId = UUID.randomUUID();
        UUID doctorId = UUID.randomUUID();
        Patient patient = new Patient(
                patientId, null, "Rohan Verma", LocalDate.of(1990, 1, 2),
                Gender.MALE, "+919900112233", "rohan@example.com", null,
                List.of("Dust"), NOW, NOW);
        when(patientRepository.findById(patientId)).thenReturn(Optional.of(patient));

        UserPrincipal doctor = new UserPrincipal(
                UUID.randomUUID(), "doc@caresync.local", "Dr. Rao", Role.DOCTOR, null, doctorId);

        when(doctorPatientScopePort.hasNonCancelledAppointment(doctorId, patientId)).thenReturn(false);
        assertThatThrownBy(() -> patientService.getPatient(doctor, patientId))
                .isInstanceOf(ForbiddenException.class);
        verify(auditService, never()).recordCurrentUser(any(), any(), any(), any());

        when(doctorPatientScopePort.hasNonCancelledAppointment(doctorId, patientId)).thenReturn(true);
        PatientResponse response = patientService.getPatient(doctor, patientId);
        assertThat(response.id()).isEqualTo(patientId);
        verify(auditService).recordCurrentUser(
                eq(AuditAction.PATIENT_READ),
                eq(patientId),
                eq(patientId),
                anyString());
    }

    @Test
    @SuppressWarnings("unchecked")
    void searchPatientsUsesDatabaseSideDoctorScopePredicateAndBlocksUpdateByDoctor() {
        UUID doctorId = UUID.randomUUID();
        UserPrincipal doctor = new UserPrincipal(
                UUID.randomUUID(), "doc@caresync.local", "Dr. Rao", Role.DOCTOR, null, doctorId);

        when(patientRepository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(Page.empty());

        PageResponse<PatientSummary> page = patientService.searchPatients(doctor, null, "Rohan", 0, 20);
        assertThat(page.content()).isEmpty();
        assertThat(page.totalElements()).isZero();

        ArgumentCaptor<Specification<Patient>> specCaptor = ArgumentCaptor.forClass(Specification.class);
        verify(patientRepository).findAll(specCaptor.capture(), any(Pageable.class));

        Root<Patient> root = mock(Root.class);
        CriteriaQuery<?> query = mock(CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        when(cb.lower(any())).thenReturn(mock());
        when(cb.like(any(), anyString(), eq('\\'))).thenReturn(mock(Predicate.class));
        when(doctorPatientScopePort.doctorOwnPatientPredicate(root, query, cb, doctorId))
                .thenReturn(mock(Predicate.class));
        specCaptor.getValue().toPredicate(root, query, cb);
        verify(doctorPatientScopePort).doctorOwnPatientPredicate(root, query, cb, doctorId);

        UUID patientId = UUID.randomUUID();
        when(patientRepository.findById(patientId)).thenReturn(Optional.of(new Patient(
                patientId, null, "Rohan Verma", null, null, null, null, null, List.of(), NOW, NOW)));

        assertThatThrownBy(() -> patientService.updatePatient(
                doctor,
                patientId,
                new PatientRequest("Rohan Verma", null, null, null, null, null, List.of())))
                .isInstanceOf(ForbiddenException.class);
    }
}
