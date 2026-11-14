package com.caresync.prescription.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.when;

import com.caresync.auth.entity.Role;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.medicine.entity.DrugInteraction;
import com.caresync.medicine.entity.Medicine;
import com.caresync.medicine.entity.MedicineForm;
import com.caresync.medicine.entity.WarningSeverity;
import com.caresync.medicine.repository.DrugInteractionRepository;
import com.caresync.medicine.repository.MedicineRepository;
import com.caresync.patient.entity.Gender;
import com.caresync.patient.entity.Patient;
import com.caresync.patient.repository.PatientRepository;
import com.caresync.patient.service.PatientService;
import com.caresync.prescription.dto.PrescriptionCheckRequest;
import com.caresync.prescription.dto.PrescriptionCheckResponse;
import com.caresync.prescription.entity.WarningType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SafetyCheckServiceTest {

    @Mock
    private PatientRepository patientRepository;
    @Mock
    private MedicineRepository medicineRepository;
    @Mock
    private DrugInteractionRepository drugInteractionRepository;
    @Mock
    private PatientService patientService;

    @InjectMocks
    private SafetyCheckService safetyCheckService;

    @Test
    void detectsAllergyAndInteractionWarningsSortedSevereFirst() {
        UUID doctorId = UUID.randomUUID();
        UserPrincipal doctor = new UserPrincipal(UUID.randomUUID(), "doc@clinic.test", "Dr. Rao", Role.DOCTOR, null, doctorId);
        UUID patientId = UUID.randomUUID();
        Patient patient = new Patient(
                patientId, null, "Ananya", null, Gender.FEMALE, null, null, null,
                List.of("Penicillin"), Instant.now(), Instant.now());

        UUID medAugmentin = UUID.fromString("10000000-0000-4000-8000-000000000001");
        UUID medClopilet = UUID.fromString("10000000-0000-4000-8000-000000000009");
        UUID medOmez = UUID.fromString("10000000-0000-4000-8000-000000000011");

        Medicine m1 = new Medicine(medAugmentin, "Augmentin 625", "Amoxicillin + Clavulanic acid", "500 mg + 125 mg", MedicineForm.TABLET, "Penicillin");
        Medicine m2 = new Medicine(medClopilet, "Clopilet 75", "Clopidogrel", "75 mg", MedicineForm.TABLET, "Antiplatelet");
        Medicine m3 = new Medicine(medOmez, "Omez 20", "Omeprazole", "20 mg", MedicineForm.CAPSULE, "Proton Pump Inhibitor");

        when(patientRepository.findById(patientId)).thenReturn(Optional.of(patient));
        when(medicineRepository.findAllById(List.of(medClopilet, medOmez, medAugmentin)))
                .thenReturn(List.of(m1, m2, m3));
        when(patientService.isDoctorOwnPatient(doctorId, patientId)).thenReturn(true);
        when(drugInteractionRepository.findInteractionsAmong(anyCollection()))
                .thenReturn(List.of(new DrugInteraction(
                        UUID.randomUUID(),
                        medClopilet,
                        medOmez,
                        WarningSeverity.MODERATE,
                        "Omeprazole reduces Clopidogrel activation")));

        PrescriptionCheckResponse response = safetyCheckService.checkPrescription(
                doctor,
                new PrescriptionCheckRequest(patientId, List.of(medClopilet, medOmez, medAugmentin)));

        assertThat(response.warnings()).hasSize(2);
        assertThat(response.warnings().get(0).type()).isEqualTo(WarningType.ALLERGY);
        assertThat(response.warnings().get(0).severity()).isEqualTo(WarningSeverity.SEVERE);
        assertThat(response.warnings().get(0).medicines()).extracting("id").containsExactly(medAugmentin);
        assertThat(response.warnings().get(1).type()).isEqualTo(WarningType.INTERACTION);
        assertThat(response.warnings().get(1).severity()).isEqualTo(WarningSeverity.MODERATE);
        assertThat(response.warnings().get(1).medicines()).hasSize(2);
    }

    @Test
    void enforcesValidationNotFoundAndOwnershipOrder() {
        UUID doctorId = UUID.randomUUID();
        UserPrincipal doctor = new UserPrincipal(UUID.randomUUID(), "doc@clinic.test", "Dr. Rao", Role.DOCTOR, null, doctorId);
        UUID patientId = UUID.randomUUID();
        UUID medId = UUID.randomUUID();

        assertThatThrownBy(() -> safetyCheckService.checkPrescription(
                doctor,
                new PrescriptionCheckRequest(patientId, List.of(medId, medId))))
                .isInstanceOf(ValidationException.class);

        when(patientRepository.findById(patientId)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> safetyCheckService.checkPrescription(
                doctor,
                new PrescriptionCheckRequest(patientId, List.of(medId))))
                .isInstanceOf(ResourceNotFoundException.class);

        Patient patient = new Patient(patientId, null, "Rohan", null, null, null, null, null, List.of(), Instant.now(), Instant.now());
        when(patientRepository.findById(patientId)).thenReturn(Optional.of(patient));
        when(medicineRepository.findAllById(List.of(medId))).thenReturn(List.of(
                new Medicine(medId, "Dolo 650", "Paracetamol", "650 mg", MedicineForm.TABLET, "Analgesic")));
        when(patientService.isDoctorOwnPatient(doctorId, patientId)).thenReturn(false);

        assertThatThrownBy(() -> safetyCheckService.checkPrescription(
                doctor,
                new PrescriptionCheckRequest(patientId, List.of(medId))))
                .isInstanceOf(ForbiddenException.class);
    }
}
