package com.caresync.billing.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.billing.entity.CreditNote;
import com.caresync.billing.entity.Currency;
import com.caresync.billing.entity.Invoice;
import com.caresync.billing.entity.InvoiceItem;
import com.caresync.billing.entity.InvoiceStatus;
import com.caresync.billing.entity.Payment;
import com.caresync.billing.entity.PaymentMethod;
import com.caresync.doctor.entity.Doctor;
import com.caresync.patient.entity.Gender;
import com.caresync.patient.entity.Patient;
import com.caresync.reference.entity.Clinic;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class InvoicePdfServiceTest {

    @Test
    void rendersValidPdfDocument() {
        Instant now = Instant.parse("2026-11-12T10:00:00Z");
        Clinic clinic = new Clinic(UUID.randomUUID(), "CareSync Indiranagar", "100 Feet Road, Bengaluru", "Asia/Kolkata");
        User docUser = new User(UUID.randomUUID(), "doc@caresync.local", "hash", "Dr. Nair", Role.DOCTOR, now);
        Doctor doctor = new Doctor(
                UUID.randomUUID(), docUser, UUID.randomUUID(), clinic.getId(), UUID.randomUUID(),
                null, new BigDecimal("500.00"), 15, true);
        Patient patient = new Patient(
                UUID.randomUUID(), null, "Rohan Verma", null, Gender.MALE,
                "+919876543210", null, null, List.of(), now, now);
        Appointment appointment = new Appointment(
                UUID.randomUUID(), doctor, patient, clinic, now, now.plusSeconds(900),
                AppointmentStatus.COMPLETED, null, now, now);
        Invoice invoice = new Invoice(
                UUID.randomUUID(), "INV-2026-000001", appointment, patient, doctor, clinic,
                InvoiceStatus.PAID, Currency.INR,
                new BigDecimal("850.00"), new BigDecimal("850.00"), new BigDecimal("100.00"),
                now, now, now);

        InvoiceItem item = new InvoiceItem(
                UUID.randomUUID(), invoice, "Consultation fee - Dr. Nair", 1,
                new BigDecimal("500.00"), new BigDecimal("500.00"), 0, now);
        Payment payment = new Payment(
                UUID.randomUUID(), invoice, new BigDecimal("850.00"), PaymentMethod.UPI,
                "UPI-123", UUID.randomUUID(), "Front Desk", now);
        CreditNote creditNote = new CreditNote(
                UUID.randomUUID(), "CN-2026-000001", invoice, new BigDecimal("100.00"),
                "Fee waiver adjustment", UUID.randomUUID(), "System Admin", now);

        byte[] pdf = new InvoicePdfService().render(invoice, List.of(item), List.of(payment), List.of(creditNote));

        assertThat(pdf.length).isGreaterThan(500);
        assertThat(new String(pdf, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    }
}
