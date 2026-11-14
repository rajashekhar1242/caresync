package com.caresync.prescription.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.consultation.entity.Consultation;
import com.caresync.doctor.entity.Doctor;
import com.caresync.medicine.entity.Medicine;
import com.caresync.medicine.entity.MedicineForm;
import com.caresync.medicine.entity.WarningSeverity;
import com.caresync.patient.entity.Patient;
import com.caresync.prescription.entity.Prescription;
import com.caresync.prescription.entity.PrescriptionItem;
import com.caresync.prescription.entity.PrescriptionWarning;
import com.caresync.prescription.entity.WarningType;
import com.caresync.reference.entity.Clinic;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PrescriptionPdfServiceTest {

    @Test
    void rendersValidPdfBytesWithItemsAndWarnings() {
        Instant now = Instant.parse("2026-06-10T06:00:00Z");
        Clinic clinic = new Clinic(UUID.randomUUID(), "CareSync Banjara Hills", "Road No. 12, Hyderabad", "Asia/Kolkata");
        User docUser = new User(UUID.randomUUID(), "Dr. Vikram Rao", "vikram@clinic.test", "hash", Role.DOCTOR, now);
        Doctor doctor = new Doctor(UUID.randomUUID(), docUser, UUID.randomUUID(), clinic.getId(), UUID.randomUUID(), null, new BigDecimal("500.00"), 15, true);
        Patient patient = new Patient(UUID.randomUUID(), null, "Priya Menon", null, null, null, null, null, List.of("Penicillin"), now, now);
        Appointment appointment = new Appointment(
                UUID.randomUUID(), doctor, patient, clinic,
                now, now.plusSeconds(900), AppointmentStatus.IN_CONSULTATION, null, now, now);
        Consultation consultation = new Consultation(UUID.randomUUID(), appointment, patient, doctor, now, now);
        consultation.setDiagnosis("Bacterial sinusitis");

        Medicine med = new Medicine(UUID.randomUUID(), "Dolo 650", "Paracetamol", "650 mg", MedicineForm.TABLET, "Analgesic");
        Prescription prescription = new Prescription(UUID.randomUUID(), consultation, appointment, patient, doctor, true, now);
        prescription.addItem(new PrescriptionItem(UUID.randomUUID(), prescription, med, "650 mg", "1-0-1", 5, "After food", 0));
        prescription.addWarning(new PrescriptionWarning(
                UUID.randomUUID(), prescription, WarningType.ALLERGY, WarningSeverity.SEVERE,
                med.getId(), med.getName(), null, null, "Test warning", 0));

        byte[] pdf = new PrescriptionPdfService().render(prescription);

        assertThat(pdf.length).isGreaterThan(500);
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    }

    @Test
    void rendersValidPdfBytesWhenNullableClinicAddressDiagnosisAllergiesAndInstructionsAreNull() {
        Instant now = Instant.parse("2026-06-10T06:00:00Z");
        Clinic clinicWithoutAddress = new Clinic(UUID.randomUUID(), "CareSync Satellite Clinic", null, "Asia/Kolkata");
        User docUser = new User(UUID.randomUUID(), "Dr. Vikram Rao", "vikram@clinic.test", "hash", Role.DOCTOR, now);
        Doctor doctor = new Doctor(UUID.randomUUID(), docUser, UUID.randomUUID(), clinicWithoutAddress.getId(), UUID.randomUUID(), null, new BigDecimal("500.00"), 15, true);
        Patient patient = new Patient(UUID.randomUUID(), null, "Arjun Verma", null, null, null, null, null, List.of(), now, now);
        Appointment appointment = new Appointment(
                UUID.randomUUID(), doctor, patient, clinicWithoutAddress,
                now, now.plusSeconds(900), AppointmentStatus.IN_CONSULTATION, null, now, now);
        Consultation consultation = new Consultation(UUID.randomUUID(), appointment, patient, doctor, now, now);
        consultation.setDiagnosis(null);

        Medicine med = new Medicine(UUID.randomUUID(), "Dolo 650", "Paracetamol", "650 mg", MedicineForm.TABLET, null);
        Prescription prescription = new Prescription(UUID.randomUUID(), consultation, appointment, patient, doctor, false, now);
        prescription.addItem(new PrescriptionItem(UUID.randomUUID(), prescription, med, "650 mg", "1-0-1", 3, null, 0));

        byte[] pdf = new PrescriptionPdfService().render(prescription);

        assertThat(pdf.length).isGreaterThan(500);
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    }
}
