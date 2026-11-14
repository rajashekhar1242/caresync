package com.caresync.billing.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.appointment.repository.AppointmentRepository;
import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.service.AuditService;
import com.caresync.auth.entity.Role;
import com.caresync.auth.entity.User;
import com.caresync.billing.dto.CreditNoteRequest;
import com.caresync.billing.dto.CreditNoteResponse;
import com.caresync.billing.dto.InvoiceItemRequest;
import com.caresync.billing.dto.InvoiceItemResponse;
import com.caresync.billing.dto.InvoiceResponse;
import com.caresync.billing.dto.PaymentRequest;
import com.caresync.billing.dto.PaymentResponse;
import com.caresync.billing.dto.VoidInvoiceRequest;
import com.caresync.billing.entity.CreditNote;
import com.caresync.billing.entity.Currency;
import com.caresync.billing.entity.Invoice;
import com.caresync.billing.entity.InvoiceItem;
import com.caresync.billing.entity.InvoiceStatus;
import com.caresync.billing.entity.Payment;
import com.caresync.billing.entity.PaymentMethod;
import com.caresync.billing.repository.CreditNoteRepository;
import com.caresync.billing.repository.InvoiceItemRepository;
import com.caresync.billing.repository.InvoiceRepository;
import com.caresync.billing.repository.PaymentRepository;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.common.util.MoneyUtils;
import com.caresync.doctor.entity.Doctor;
import com.caresync.patient.entity.Gender;
import com.caresync.patient.entity.Patient;
import com.caresync.reference.entity.Clinic;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.hibernate.exception.ConstraintViolationException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

@ExtendWith(MockitoExtension.class)
class InvoiceServiceTest {

    private static final Instant FIXED_NOW = Instant.parse("2026-11-12T10:00:00Z");

    @Mock
    private InvoiceRepository invoiceRepository;

    @Mock
    private InvoiceItemRepository invoiceItemRepository;

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private CreditNoteRepository creditNoteRepository;

    @Mock
    private AppointmentRepository appointmentRepository;

    @Mock
    private AuditService auditService;

    private InvoiceService invoiceService;

    private Clinic clinic;
    private Doctor doctor;
    private Patient patient;
    private Appointment appointment;
    private UserPrincipal adminCaller;
    private UserPrincipal receptionistCaller;
    private UserPrincipal doctorCaller;
    private UserPrincipal patientCaller;
    private UserPrincipal otherPatientCaller;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(FIXED_NOW, ZoneOffset.UTC);
        invoiceService = new InvoiceService(
                invoiceRepository,
                invoiceItemRepository,
                paymentRepository,
                creditNoteRepository,
                appointmentRepository,
                new InvoicePdfService(),
                auditService,
                clock);

        clinic = new Clinic(UUID.randomUUID(), "CareSync Banjara Hills", "Hyderabad", "Asia/Kolkata");
        UUID docUserId = UUID.randomUUID();
        User doctorUser = new User(docUserId, "doc@caresync.local", "hash", "Dr. Rao", Role.DOCTOR, FIXED_NOW);
        UUID doctorId = UUID.randomUUID();
        doctor = new Doctor(
                doctorId, doctorUser, UUID.randomUUID(), clinic.getId(), UUID.randomUUID(),
                null, new BigDecimal("600.00"), 15, true);

        UUID patientId = UUID.randomUUID();
        UUID patUserId = UUID.randomUUID();
        patient = new Patient(
                patientId, patUserId, "Asha Reddy", null, Gender.FEMALE,
                "+919876543210", "asha@example.com", null, List.of(), FIXED_NOW, FIXED_NOW);

        appointment = new Appointment(
                UUID.randomUUID(), doctor, patient, clinic,
                FIXED_NOW.minusSeconds(1800), FIXED_NOW.minusSeconds(900),
                AppointmentStatus.COMPLETED, "Checkup", FIXED_NOW.minusSeconds(3600), FIXED_NOW);

        adminCaller = new UserPrincipal(UUID.randomUUID(), "admin@caresync.local", "Admin User", Role.ADMIN, null, null);
        receptionistCaller = new UserPrincipal(
                UUID.randomUUID(), "front@caresync.local", "Front Desk", Role.RECEPTIONIST, null, null);
        doctorCaller = new UserPrincipal(docUserId, "doc@caresync.local", "Dr. Rao", Role.DOCTOR, null, doctorId);
        patientCaller = new UserPrincipal(patUserId, "asha@example.com", "Asha Reddy", Role.PATIENT, patientId, null);
        otherPatientCaller = new UserPrincipal(
                UUID.randomUUID(), "other@example.com", "Other Patient", Role.PATIENT, UUID.randomUUID(), null);
    }

    @Test
    void createConsultationInvoiceHandlesPositiveAndZeroFees() {
        when(invoiceRepository.existsByAppointment_IdAndStatusNot(appointment.getId(), InvoiceStatus.VOID))
                .thenReturn(false);
        when(invoiceRepository.nextInvoiceSequence()).thenReturn(123L);
        when(invoiceRepository.saveAndFlush(any(Invoice.class))).thenAnswer(inv -> inv.getArgument(0));
        when(invoiceItemRepository.saveAndFlush(any(InvoiceItem.class))).thenAnswer(inv -> inv.getArgument(0));

        invoiceService.createConsultationInvoice(appointment, FIXED_NOW);

        ArgumentCaptor<Invoice> invCaptor = ArgumentCaptor.forClass(Invoice.class);
        verify(invoiceRepository).saveAndFlush(invCaptor.capture());
        Invoice saved = invCaptor.getValue();
        assertThat(saved.getInvoiceNumber()).isEqualTo("INV-2026-000123");
        assertThat(saved.getStatus()).isEqualTo(InvoiceStatus.PENDING);
        assertThat(saved.getTotal()).isEqualByComparingTo("600.00");
        assertThat(saved.getPaidAt()).isNull();
        verify(auditService).record(
                eq(doctor.getUser().getId()), eq("Dr. Rao"), eq(Role.DOCTOR),
                eq(AuditAction.INVOICE_CREATED), eq(saved.getId()), eq(patient.getId()), any(), any());

        // Zero-fee doctor creates immediately PAID invoice
        doctor.setConsultationFee(new BigDecimal("0.00"));
        when(invoiceRepository.nextInvoiceSequence()).thenReturn(124L);
        invoiceService.createConsultationInvoice(appointment, FIXED_NOW);

        verify(invoiceRepository, org.mockito.Mockito.times(2)).saveAndFlush(invCaptor.capture());
        Invoice zeroFeeInvoice = invCaptor.getValue();
        assertThat(zeroFeeInvoice.getInvoiceNumber()).isEqualTo("INV-2026-000124");
        assertThat(zeroFeeInvoice.getStatus()).isEqualTo(InvoiceStatus.PAID);
        assertThat(zeroFeeInvoice.getTotal()).isEqualByComparingTo("0.00");
        assertThat(zeroFeeInvoice.getPaidAt()).isEqualTo(FIXED_NOW);
    }

    @Test
    void addItemComputesExactLineTotalAndRejectsImmutableOrZeroPrice() {
        Invoice pending = sampleInvoice(InvoiceStatus.PENDING, "600.00", "0.00", "0.00");
        when(invoiceRepository.findLockedById(pending.getId())).thenReturn(Optional.of(pending));
        when(invoiceItemRepository.nextSortOrder(pending.getId())).thenReturn(1);
        when(invoiceItemRepository.saveAndFlush(any(InvoiceItem.class))).thenAnswer(inv -> inv.getArgument(0));
        when(invoiceRepository.saveAndFlush(any(Invoice.class))).thenAnswer(inv -> inv.getArgument(0));

        InvoiceItemResponse res = invoiceService.addInvoiceItem(
                receptionistCaller,
                pending.getId(),
                new InvoiceItemRequest("  ECG Scan ", 3, "125.50"));

        assertThat(res.description()).isEqualTo("ECG Scan");
        assertThat(res.quantity()).isEqualTo(3);
        assertThat(res.unitPrice()).isEqualTo("125.50");
        assertThat(res.lineTotal()).isEqualTo("376.50");
        assertThat(pending.getTotal()).isEqualByComparingTo("976.50");
        assertThat(pending.getStatus()).isEqualTo(InvoiceStatus.PENDING);

        // Zero unitPrice rejected before lookup
        assertThatThrownBy(() -> invoiceService.addInvoiceItem(
                patientCaller, pending.getId(), new InvoiceItemRequest("Free", 1, "0.00")))
                .isInstanceOf(ValidationException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.VALIDATION_FAILED);

        // Immutable PAID invoice rejected
        pending.setStatus(InvoiceStatus.PAID);
        assertThatThrownBy(() -> invoiceService.addInvoiceItem(
                adminCaller, pending.getId(), new InvoiceItemRequest("X-Ray", 1, "300.00")))
                .isInstanceOf(ConflictException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVOICE_IMMUTABLE);
    }

    @Test
    void recordPaymentSupportsPartialAndFullTransitionsAndEnforcesChecksOrder() {
        Invoice invoice = sampleInvoice(InvoiceStatus.PENDING, "600.00", "0.00", "0.00");
        when(invoiceRepository.findLockedById(invoice.getId())).thenReturn(Optional.of(invoice));
        when(paymentRepository.saveAndFlush(any(Payment.class))).thenAnswer(inv -> inv.getArgument(0));
        when(invoiceRepository.saveAndFlush(any(Invoice.class))).thenAnswer(inv -> inv.getArgument(0));

        // Partial CASH payment without txnRef
        PaymentResponse partial = invoiceService.recordPayment(
                receptionistCaller, invoice.getId(), new PaymentRequest("250.00", PaymentMethod.CASH, null));
        assertThat(partial.amount()).isEqualTo("250.00");
        assertThat(partial.receivedBy()).isEqualTo("Front Desk");
        assertThat(invoice.getStatus()).isEqualTo(InvoiceStatus.PARTIALLY_PAID);
        assertThat(invoice.getBalance()).isEqualByComparingTo("350.00");
        assertThat(invoice.getPaidAt()).isNull();

        // Missing txnRef for UPI -> 400 VALIDATION_FAILED before 404/403
        assertThatThrownBy(() -> invoiceService.recordPayment(
                doctorCaller, UUID.randomUUID(), new PaymentRequest("100.00", PaymentMethod.UPI, "   ")))
                .isInstanceOf(ValidationException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.VALIDATION_FAILED);

        // Overpayment -> 400 OVERPAYMENT
        when(paymentRepository.existsByMethodAndTxnRef(PaymentMethod.UPI, "UPI-999")).thenReturn(false);
        assertThatThrownBy(() -> invoiceService.recordPayment(
                adminCaller, invoice.getId(), new PaymentRequest("350.01", PaymentMethod.UPI, "UPI-999")))
                .isInstanceOf(ValidationException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.OVERPAYMENT);

        // Duplicate txnRef -> 409 DUPLICATE_TXN_REF
        when(paymentRepository.existsByMethodAndTxnRef(PaymentMethod.CARD, "CARD-DUP")).thenReturn(true);
        assertThatThrownBy(() -> invoiceService.recordPayment(
                adminCaller, invoice.getId(), new PaymentRequest("100.00", PaymentMethod.CARD, "CARD-DUP")))
                .isInstanceOf(ConflictException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.DUPLICATE_TXN_REF);

        // Remaining balance via UPI -> PAID
        when(paymentRepository.existsByMethodAndTxnRef(PaymentMethod.UPI, "UPI-OK")).thenReturn(false);
        PaymentResponse finalPay = invoiceService.recordPayment(
                adminCaller, invoice.getId(), new PaymentRequest("350.00", PaymentMethod.UPI, "UPI-OK"));
        assertThat(finalPay.txnRef()).isEqualTo("UPI-OK");
        assertThat(invoice.getStatus()).isEqualTo(InvoiceStatus.PAID);
        assertThat(invoice.getBalance()).isEqualByComparingTo("0.00");
        assertThat(invoice.getPaidAt()).isEqualTo(FIXED_NOW);

        // Further payment on PAID -> 409 INVOICE_IMMUTABLE
        assertThatThrownBy(() -> invoiceService.recordPayment(
                adminCaller, invoice.getId(), new PaymentRequest("10.00", PaymentMethod.CASH, null)))
                .isInstanceOf(ConflictException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVOICE_IMMUTABLE);
    }

    @Test
    void recordPaymentTranslatesConcurrentUniqueTxnRefViolationOnly() {
        Invoice invoice = sampleInvoice(InvoiceStatus.PENDING, "500.00", "0.00", "0.00");
        when(invoiceRepository.findLockedById(invoice.getId())).thenReturn(Optional.of(invoice));
        when(paymentRepository.existsByMethodAndTxnRef(PaymentMethod.UPI, "UPI-RACE")).thenReturn(false);

        SQLException dupSql = new SQLException(
                "duplicate key value violates unique constraint \"uq_payment_method_txn_ref\"", "23505");
        ConstraintViolationException cve = new ConstraintViolationException(
                "insert payment", dupSql, "uq_payment_method_txn_ref");
        when(paymentRepository.saveAndFlush(any(Payment.class)))
                .thenThrow(new DataIntegrityViolationException("constraint violation", cve));

        assertThatThrownBy(() -> invoiceService.recordPayment(
                adminCaller, invoice.getId(), new PaymentRequest("500.00", PaymentMethod.UPI, "UPI-RACE")))
                .isInstanceOf(ConflictException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.DUPLICATE_TXN_REF);

        // Unrelated constraint violation is rethrown unchanged
        DataIntegrityViolationException unrelated = new DataIntegrityViolationException(
                "fk failure",
                new ConstraintViolationException("fk", new SQLException("fk", "23503"), "payments_invoice_id_fkey"));
        when(paymentRepository.saveAndFlush(any(Payment.class))).thenThrow(unrelated);
        assertThatThrownBy(() -> invoiceService.recordPayment(
                adminCaller, invoice.getId(), new PaymentRequest("500.00", PaymentMethod.UPI, "UPI-RACE")))
                .isSameAs(unrelated);
    }

    @Test
    void creditNoteRequiresAdminPaidInvoiceAndRespectsInvoiceTotal() {
        Invoice invoice = sampleInvoice(InvoiceStatus.PENDING, "500.00", "0.00", "0.00");
        when(invoiceRepository.findLockedById(invoice.getId())).thenReturn(Optional.of(invoice));

        // Receptionist rejected (403)
        assertThatThrownBy(() -> invoiceService.createCreditNote(
                receptionistCaller, invoice.getId(), new CreditNoteRequest("100.00", "Billing adjustment")))
                .isInstanceOf(ForbiddenException.class);

        // PENDING invoice rejected (409 INVOICE_NOT_PAID)
        assertThatThrownBy(() -> invoiceService.createCreditNote(
                adminCaller, invoice.getId(), new CreditNoteRequest("100.00", "Billing adjustment")))
                .isInstanceOf(ConflictException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVOICE_NOT_PAID);

        // PAID invoice allows credit up to total
        invoice.setStatus(InvoiceStatus.PAID);
        invoice.setAmountPaid(new BigDecimal("500.00"));
        invoice.setCreditedTotal(new BigDecimal("350.00"));

        assertThatThrownBy(() -> invoiceService.createCreditNote(
                adminCaller, invoice.getId(), new CreditNoteRequest("150.01", "Too much credit")))
                .isInstanceOf(ValidationException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.CREDIT_EXCEEDS_INVOICE);

        when(invoiceRepository.nextCreditNoteSequence()).thenReturn(7L);
        when(creditNoteRepository.saveAndFlush(any(CreditNote.class))).thenAnswer(inv -> inv.getArgument(0));
        when(invoiceRepository.saveAndFlush(any(Invoice.class))).thenAnswer(inv -> inv.getArgument(0));

        CreditNoteResponse res = invoiceService.createCreditNote(
                adminCaller, invoice.getId(), new CreditNoteRequest("150.00", "  Duplicate charge refund  "));
        assertThat(res.creditNoteNumber()).isEqualTo("CN-2026-000007");
        assertThat(res.amount()).isEqualTo("150.00");
        assertThat(res.reason()).isEqualTo("Duplicate charge refund");
        assertThat(invoice.getCreditedTotal()).isEqualByComparingTo("500.00");
        assertThat(invoice.getNetTotal()).isEqualByComparingTo("0.00");
        assertThat(invoice.getStatus()).isEqualTo(InvoiceStatus.PAID);
    }

    @Test
    void voidInvoiceTransitionsPendingAndRejectsPartialOrPaid() {
        Invoice invoice = sampleInvoice(InvoiceStatus.PARTIALLY_PAID, "500.00", "100.00", "0.00");
        when(invoiceRepository.findLockedById(invoice.getId())).thenReturn(Optional.of(invoice));

        assertThatThrownBy(() -> invoiceService.voidInvoice(
                adminCaller, invoice.getId(), new VoidInvoiceRequest("Wrong billing")))
                .isInstanceOf(ConflictException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVOICE_HAS_PAYMENTS);

        invoice.setStatus(InvoiceStatus.PAID);
        assertThatThrownBy(() -> invoiceService.voidInvoice(
                adminCaller, invoice.getId(), new VoidInvoiceRequest("Wrong billing")))
                .isInstanceOf(ConflictException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.INVOICE_IMMUTABLE);

        invoice.setStatus(InvoiceStatus.PENDING);
        invoice.setAmountPaid(MoneyUtils.ZERO);
        when(invoiceRepository.saveAndFlush(any(Invoice.class))).thenAnswer(inv -> inv.getArgument(0));
        when(invoiceItemRepository.findByInvoice_IdOrderBySortOrderAscCreatedAtAsc(invoice.getId())).thenReturn(List.of());
        when(paymentRepository.findByInvoice_IdOrderByCreatedAtAscIdAsc(invoice.getId())).thenReturn(List.of());
        when(creditNoteRepository.findByInvoice_IdOrderByCreatedAtAscIdAsc(invoice.getId())).thenReturn(List.of());

        InvoiceResponse voided = invoiceService.voidInvoice(
                receptionistCaller, invoice.getId(), new VoidInvoiceRequest("Wrong patient billed"));
        assertThat(voided.status()).isEqualTo(InvoiceStatus.VOID);
        assertThat(voided.voidReason()).isEqualTo("Wrong patient billed");
        verify(auditService).record(
                eq(receptionistCaller), eq(AuditAction.INVOICE_VOIDED), eq(invoice.getId()),
                eq(patient.getId()), eq("Voided invoice INV-2026-000001: Wrong patient billed"), any());
    }

    @Test
    void enforcesOwnershipAndAppointmentInvoiceCheckOrdering() {
        Invoice invoice = sampleInvoice(InvoiceStatus.PENDING, "600.00", "0.00", "0.00");
        when(invoiceRepository.findWithDetailsById(invoice.getId())).thenReturn(Optional.of(invoice));
        when(invoiceItemRepository.findByInvoice_IdOrderBySortOrderAscCreatedAtAsc(invoice.getId())).thenReturn(List.of());
        when(paymentRepository.findByInvoice_IdOrderByCreatedAtAscIdAsc(invoice.getId())).thenReturn(List.of());
        when(creditNoteRepository.findByInvoice_IdOrderByCreatedAtAscIdAsc(invoice.getId())).thenReturn(List.of());

        assertThat(invoiceService.getInvoice(patientCaller, invoice.getId()).id()).isEqualTo(invoice.getId());
        assertThatThrownBy(() -> invoiceService.getInvoice(otherPatientCaller, invoice.getId()))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> invoiceService.getInvoice(doctorCaller, invoice.getId()))
                .isInstanceOf(ForbiddenException.class);

        assertThatThrownBy(() -> invoiceService.listInvoices(doctorCaller, null, null, null, null, 0, 20))
                .isInstanceOf(ForbiddenException.class);
        assertThatThrownBy(() -> invoiceService.listInvoices(
                patientCaller, null, otherPatientCaller.getPatientId(), null, null, 0, 20))
                .isInstanceOf(ForbiddenException.class);

        when(appointmentRepository.findWithDetailsById(appointment.getId())).thenReturn(Optional.of(appointment));
        assertThatThrownBy(() -> invoiceService.getAppointmentInvoice(otherPatientCaller, appointment.getId()))
                .isInstanceOf(ForbiddenException.class);

        when(invoiceRepository.findFirstByAppointment_IdAndStatusNotOrderByCreatedAtDescIdDesc(
                appointment.getId(), InvoiceStatus.VOID)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> invoiceService.getAppointmentInvoice(patientCaller, appointment.getId()))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(auditService, org.mockito.Mockito.times(1)).record(
                eq(patientCaller), eq(AuditAction.INVOICE_READ), any(), any(), any(), any());
    }

    private Invoice sampleInvoice(InvoiceStatus status, String total, String paid, String credited) {
        return new Invoice(
                UUID.randomUUID(),
                "INV-2026-000001",
                appointment,
                patient,
                doctor,
                clinic,
                status,
                Currency.INR,
                new BigDecimal(total),
                new BigDecimal(paid),
                new BigDecimal(credited),
                status == InvoiceStatus.PAID ? FIXED_NOW : null,
                FIXED_NOW,
                FIXED_NOW);
    }
}
