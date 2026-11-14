package com.caresync.billing.service;

import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.repository.AppointmentRepository;
import com.caresync.appointment.service.AppointmentBillingPort;
import com.caresync.audit.entity.AuditAction;
import com.caresync.audit.service.AuditService;
import com.caresync.auth.entity.Role;
import com.caresync.billing.dto.CreditNoteRequest;
import com.caresync.billing.dto.CreditNoteResponse;
import com.caresync.billing.dto.InvoiceItemRequest;
import com.caresync.billing.dto.InvoiceItemResponse;
import com.caresync.billing.dto.InvoiceResponse;
import com.caresync.billing.dto.InvoiceSummary;
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
import com.caresync.common.dto.PageResponse;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.SecurityUtils;
import com.caresync.common.security.UserPrincipal;
import com.caresync.common.util.MoneyUtils;
import com.caresync.common.util.RequestIpUtils;
import com.caresync.common.util.TimeZoneUtils;
import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.hibernate.exception.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service implementing Hospital & Clinic Management System (HCMS) billing lifecycle: auto-invoicing completed appointments,
 * counter payments, credit notes, voiding, filtered invoice queries, PDF rendering, and audit logging.
 */
@Service
public class InvoiceService implements AppointmentBillingPort {

    private static final String DUPLICATE_TXN_REF_CONSTRAINT = "uq_payment_method_txn_ref";
    private static final String POSTGRES_UNIQUE_VIOLATION_SQL_STATE = "23505";

    private final InvoiceRepository invoiceRepository;
    private final InvoiceItemRepository invoiceItemRepository;
    private final PaymentRepository paymentRepository;
    private final CreditNoteRepository creditNoteRepository;
    private final AppointmentRepository appointmentRepository;
    private final InvoicePdfService invoicePdfService;
    private final AuditService auditService;
    private final Clock clock;

    public InvoiceService(
            InvoiceRepository invoiceRepository,
            InvoiceItemRepository invoiceItemRepository,
            PaymentRepository paymentRepository,
            CreditNoteRepository creditNoteRepository,
            AppointmentRepository appointmentRepository,
            InvoicePdfService invoicePdfService,
            AuditService auditService,
            Clock clock) {
        this.invoiceRepository = invoiceRepository;
        this.invoiceItemRepository = invoiceItemRepository;
        this.paymentRepository = paymentRepository;
        this.creditNoteRepository = creditNoteRepository;
        this.appointmentRepository = appointmentRepository;
        this.invoicePdfService = invoicePdfService;
        this.auditService = auditService;
        this.clock = clock;
    }

    @Override
    @Transactional
    public void createConsultationInvoice(Appointment appointment, Instant createdAt) {
        if (invoiceRepository.existsByAppointment_IdAndStatusNot(appointment.getId(), InvoiceStatus.VOID)) {
            return;
        }

        BigDecimal consultationFee = appointment.getDoctor().getConsultationFee()
                .setScale(2, RoundingMode.UNNECESSARY);
        ZoneId clinicZone = TimeZoneUtils.resolveZone(appointment.getClinic().getTimeZone());
        int year = ZonedDateTime.ofInstant(createdAt, clinicZone).getYear();
        String invoiceNumber = String.format("INV-%04d-%06d", year, invoiceRepository.nextInvoiceSequence());

        boolean zeroFee = consultationFee.compareTo(BigDecimal.ZERO) == 0;
        InvoiceStatus initialStatus = zeroFee ? InvoiceStatus.PAID : InvoiceStatus.PENDING;
        Instant paidAt = zeroFee ? createdAt : null;

        Invoice invoice = new Invoice(
                UUID.randomUUID(),
                invoiceNumber,
                appointment,
                appointment.getPatient(),
                appointment.getDoctor(),
                appointment.getClinic(),
                initialStatus,
                Currency.INR,
                consultationFee,
                MoneyUtils.ZERO,
                MoneyUtils.ZERO,
                paidAt,
                createdAt,
                createdAt);
        invoiceRepository.saveAndFlush(invoice);

        String doctorName = appointment.getDoctor().getUser().getFullName();
        String itemDescription = truncate("Consultation fee - " + doctorName, 200);
        InvoiceItem initialItem = new InvoiceItem(
                UUID.randomUUID(),
                invoice,
                itemDescription,
                1,
                consultationFee,
                consultationFee,
                0,
                createdAt);
        invoiceItemRepository.saveAndFlush(initialItem);

        String details = "Invoice " + invoiceNumber + " auto-created on appointment completion";
        SecurityUtils.getCurrentPrincipal().ifPresentOrElse(
                principal -> auditService.record(
                        principal,
                        AuditAction.INVOICE_CREATED,
                        invoice.getId(),
                        appointment.getPatient().getId(),
                        details,
                        RequestIpUtils.extractCurrentClientIp()),
                () -> auditService.record(
                        appointment.getDoctor().getUser().getId(),
                        doctorName,
                        Role.DOCTOR,
                        AuditAction.INVOICE_CREATED,
                        invoice.getId(),
                        appointment.getPatient().getId(),
                        details,
                        null));
    }

    @Transactional(readOnly = true)
    public PageResponse<InvoiceSummary> listInvoices(
            UserPrincipal caller,
            List<InvoiceStatus> statuses,
            UUID patientId,
            Instant from,
            Instant to,
            int page,
            int size) {
        if (caller.getRole() == Role.DOCTOR) {
            throw new ForbiddenException("Doctors are not permitted to access billing invoices");
        }
        UUID effectivePatientId = patientId;
        if (caller.getRole() == Role.PATIENT) {
            if (caller.getPatientId() == null) {
                throw new ForbiddenException("Patient profile is not linked to caller");
            }
            if (patientId != null && !patientId.equals(caller.getPatientId())) {
                throw new ForbiddenException("Patients may only view their own invoices");
            }
            effectivePatientId = caller.getPatientId();
        }

        if (from != null && to != null && !from.isBefore(to)) {
            throw new ValidationException("from", "must be before to");
        }

        Specification<Invoice> spec = buildListSpecification(statuses, effectivePatientId, from, to);
        PageRequest pageable = PageRequest.of(
                page,
                size,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        Page<InvoiceSummary> results = invoiceRepository.findAll(spec, pageable)
                .map(InvoiceSummary::from);
        return PageResponse.from(results);
    }

    @Transactional
    public InvoiceResponse getInvoice(UserPrincipal caller, UUID invoiceId) {
        Invoice invoice = invoiceRepository.findWithDetailsById(invoiceId)
                .orElseThrow(() -> new ResourceNotFoundException("Invoice not found"));
        enforceReadAccess(caller, invoice.getPatient().getId());

        InvoiceResponse response = buildFullResponse(invoice);
        auditService.record(
                caller,
                AuditAction.INVOICE_READ,
                invoice.getId(),
                invoice.getPatient().getId(),
                "Invoice " + invoice.getInvoiceNumber() + " read",
                RequestIpUtils.extractCurrentClientIp());
        return response;
    }

    @Transactional
    public InvoiceResponse getAppointmentInvoice(UserPrincipal caller, UUID appointmentId) {
        Appointment appointment = appointmentRepository.findWithDetailsById(appointmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Appointment not found"));
        enforceReadAccess(caller, appointment.getPatient().getId());

        Invoice invoice = invoiceRepository
                .findFirstByAppointment_IdAndStatusNotOrderByCreatedAtDescIdDesc(appointmentId, InvoiceStatus.VOID)
                .orElseThrow(() -> new ResourceNotFoundException("No active invoice found for appointment"));

        InvoiceResponse response = buildFullResponse(invoice);
        auditService.record(
                caller,
                AuditAction.INVOICE_READ,
                invoice.getId(),
                invoice.getPatient().getId(),
                "Invoice " + invoice.getInvoiceNumber() + " read via appointment",
                RequestIpUtils.extractCurrentClientIp());
        return response;
    }

    @Transactional
    public InvoicePdfDownload getInvoicePdf(UserPrincipal caller, UUID invoiceId) {
        Invoice invoice = invoiceRepository.findWithDetailsById(invoiceId)
                .orElseThrow(() -> new ResourceNotFoundException("Invoice not found"));
        enforceReadAccess(caller, invoice.getPatient().getId());

        List<InvoiceItem> items = invoiceItemRepository.findByInvoice_IdOrderBySortOrderAscCreatedAtAsc(invoiceId);
        List<Payment> payments = paymentRepository.findByInvoice_IdOrderByCreatedAtAscIdAsc(invoiceId);
        List<CreditNote> creditNotes = creditNoteRepository.findByInvoice_IdOrderByCreatedAtAscIdAsc(invoiceId);

        byte[] pdfBytes = invoicePdfService.render(invoice, items, payments, creditNotes);
        auditService.record(
                caller,
                AuditAction.INVOICE_PDF_DOWNLOADED,
                invoice.getId(),
                invoice.getPatient().getId(),
                "Invoice " + invoice.getInvoiceNumber() + " PDF downloaded",
                RequestIpUtils.extractCurrentClientIp());
        return new InvoicePdfDownload(invoice.getInvoiceNumber(), pdfBytes);
    }

    @Transactional
    public InvoiceItemResponse addInvoiceItem(UserPrincipal caller, UUID invoiceId, InvoiceItemRequest request) {
        String description = normalizeRequired(request.description(), "description", 1, 200);
        BigDecimal unitPrice = MoneyUtils.parsePositive(request.unitPrice(), "unitPrice");
        int quantity = request.quantity();

        Invoice invoice = invoiceRepository.findLockedById(invoiceId)
                .orElseThrow(() -> new ResourceNotFoundException("Invoice not found"));
        enforceBillingStaff(caller);

        if (invoice.getStatus() == InvoiceStatus.PAID || invoice.getStatus() == InvoiceStatus.VOID) {
            throw new ConflictException(
                    ErrorCode.INVOICE_IMMUTABLE,
                    "Items cannot be added to a " + invoice.getStatus().name() + " invoice");
        }

        Instant now = Instant.now(clock);
        BigDecimal lineTotal = unitPrice.multiply(BigDecimal.valueOf(quantity))
                .setScale(2, RoundingMode.UNNECESSARY);
        int sortOrder = invoiceItemRepository.nextSortOrder(invoiceId);

        InvoiceItem item = new InvoiceItem(
                UUID.randomUUID(),
                invoice,
                description,
                quantity,
                unitPrice,
                lineTotal,
                sortOrder,
                now);
        InvoiceItem savedItem = invoiceItemRepository.saveAndFlush(item);

        invoice.setTotal(invoice.getTotal().add(lineTotal));
        invoice.setUpdatedAt(now);
        invoiceRepository.saveAndFlush(invoice);

        auditService.record(
                caller,
                AuditAction.INVOICE_ITEM_ADDED,
                invoice.getId(),
                invoice.getPatient().getId(),
                "Added item '" + description + "' (qty " + quantity + ", lineTotal " + MoneyUtils.format(lineTotal) + ")",
                RequestIpUtils.extractCurrentClientIp());

        return InvoiceItemResponse.from(savedItem);
    }

    @Transactional
    public PaymentResponse recordPayment(UserPrincipal caller, UUID invoiceId, PaymentRequest request) {
        BigDecimal amount = MoneyUtils.parsePositive(request.amount(), "amount");
        String normalizedTxnRef = validateAndNormalizeTxnRef(request.method(), request.txnRef());

        Invoice invoice = invoiceRepository.findLockedById(invoiceId)
                .orElseThrow(() -> new ResourceNotFoundException("Invoice not found"));
        enforceBillingStaff(caller);

        if (invoice.getStatus() == InvoiceStatus.PAID || invoice.getStatus() == InvoiceStatus.VOID) {
            throw new ConflictException(
                    ErrorCode.INVOICE_IMMUTABLE,
                    "Payments cannot be recorded against a " + invoice.getStatus().name() + " invoice");
        }

        if (request.method() != PaymentMethod.CASH
                && paymentRepository.existsByMethodAndTxnRef(request.method(), normalizedTxnRef)) {
            throw new ConflictException(
                    ErrorCode.DUPLICATE_TXN_REF,
                    "Transaction reference has already been used for method " + request.method().name());
        }

        BigDecimal remainingBalance = invoice.getBalance();
        if (amount.compareTo(remainingBalance) > 0) {
            throw new ValidationException(
                    ErrorCode.OVERPAYMENT,
                    "Payment amount exceeds remaining invoice balance of " + MoneyUtils.format(remainingBalance));
        }

        Instant now = Instant.now(clock);
        Payment payment = new Payment(
                UUID.randomUUID(),
                invoice,
                amount,
                request.method(),
                normalizedTxnRef,
                caller.getUserId(),
                truncate(caller.getFullName().trim(), 100),
                now);

        Payment savedPayment;
        try {
            savedPayment = paymentRepository.saveAndFlush(payment);
        } catch (DataIntegrityViolationException ex) {
            if (isDuplicateTxnRefViolation(ex)) {
                throw new ConflictException(
                        ErrorCode.DUPLICATE_TXN_REF,
                        "Transaction reference has already been used for method " + request.method().name());
            }
            throw ex;
        }

        BigDecimal newAmountPaid = invoice.getAmountPaid().add(amount);
        invoice.setAmountPaid(newAmountPaid);
        if (newAmountPaid.compareTo(invoice.getTotal()) == 0) {
            invoice.setStatus(InvoiceStatus.PAID);
            invoice.setPaidAt(now);
        } else {
            invoice.setStatus(InvoiceStatus.PARTIALLY_PAID);
        }
        invoice.setUpdatedAt(now);
        invoiceRepository.saveAndFlush(invoice);

        auditService.record(
                caller,
                AuditAction.PAYMENT_RECORDED,
                invoice.getId(),
                invoice.getPatient().getId(),
                "Recorded " + request.method().name() + " payment of " + MoneyUtils.format(amount)
                        + " on invoice " + invoice.getInvoiceNumber(),
                RequestIpUtils.extractCurrentClientIp());

        return PaymentResponse.from(savedPayment);
    }

    @Transactional
    public CreditNoteResponse createCreditNote(UserPrincipal caller, UUID invoiceId, CreditNoteRequest request) {
        BigDecimal amount = MoneyUtils.parsePositive(request.amount(), "amount");
        String reason = normalizeRequired(request.reason(), "reason", 5, 500);

        Invoice invoice = invoiceRepository.findLockedById(invoiceId)
                .orElseThrow(() -> new ResourceNotFoundException("Invoice not found"));
        if (caller.getRole() != Role.ADMIN) {
            throw new ForbiddenException("Only administrators may issue credit notes");
        }

        if (invoice.getStatus() != InvoiceStatus.PAID) {
            throw new ConflictException(
                    ErrorCode.INVOICE_NOT_PAID,
                    "Credit notes may only be issued against PAID invoices");
        }

        BigDecimal remainingCreditable = invoice.getTotal().subtract(invoice.getCreditedTotal());
        if (amount.compareTo(remainingCreditable) > 0) {
            throw new ValidationException(
                    ErrorCode.CREDIT_EXCEEDS_INVOICE,
                    "Credit notes total cannot exceed invoice total");
        }

        Instant now = Instant.now(clock);
        ZoneId clinicZone = TimeZoneUtils.resolveZone(invoice.getClinic().getTimeZone());
        int year = ZonedDateTime.ofInstant(now, clinicZone).getYear();
        String creditNoteNumber = String.format("CN-%04d-%06d", year, invoiceRepository.nextCreditNoteSequence());

        CreditNote creditNote = new CreditNote(
                UUID.randomUUID(),
                creditNoteNumber,
                invoice,
                amount,
                reason,
                caller.getUserId(),
                truncate(caller.getFullName().trim(), 100),
                now);
        CreditNote savedCreditNote = creditNoteRepository.saveAndFlush(creditNote);

        invoice.setCreditedTotal(invoice.getCreditedTotal().add(amount));
        invoice.setUpdatedAt(now);
        invoiceRepository.saveAndFlush(invoice);

        auditService.record(
                caller,
                AuditAction.CREDIT_NOTE_ISSUED,
                invoice.getId(),
                invoice.getPatient().getId(),
                "Issued credit note " + creditNoteNumber + " for " + MoneyUtils.format(amount) + ": " + reason,
                RequestIpUtils.extractCurrentClientIp());

        return CreditNoteResponse.from(savedCreditNote);
    }

    @Transactional
    public InvoiceResponse voidInvoice(UserPrincipal caller, UUID invoiceId, VoidInvoiceRequest request) {
        String reason = normalizeRequired(request.reason(), "reason", 5, 500);

        Invoice invoice = invoiceRepository.findLockedById(invoiceId)
                .orElseThrow(() -> new ResourceNotFoundException("Invoice not found"));
        enforceBillingStaff(caller);

        if (invoice.getStatus() == InvoiceStatus.PAID || invoice.getStatus() == InvoiceStatus.VOID) {
            throw new ConflictException(
                    ErrorCode.INVOICE_IMMUTABLE,
                    "Cannot void an invoice in status " + invoice.getStatus().name());
        }
        if (invoice.getStatus() == InvoiceStatus.PARTIALLY_PAID) {
            throw new ConflictException(
                    ErrorCode.INVOICE_HAS_PAYMENTS,
                    "Cannot void an invoice that has received payments");
        }

        Instant now = Instant.now(clock);
        invoice.setStatus(InvoiceStatus.VOID);
        invoice.setVoidReason(reason);
        invoice.setUpdatedAt(now);
        Invoice saved = invoiceRepository.saveAndFlush(invoice);

        auditService.record(
                caller,
                AuditAction.INVOICE_VOIDED,
                saved.getId(),
                saved.getPatient().getId(),
                "Voided invoice " + saved.getInvoiceNumber() + ": " + reason,
                RequestIpUtils.extractCurrentClientIp());

        return buildFullResponse(saved);
    }

    private InvoiceResponse buildFullResponse(Invoice invoice) {
        UUID invoiceId = invoice.getId();
        List<InvoiceItem> items = invoiceItemRepository.findByInvoice_IdOrderBySortOrderAscCreatedAtAsc(invoiceId);
        List<Payment> payments = paymentRepository.findByInvoice_IdOrderByCreatedAtAscIdAsc(invoiceId);
        List<CreditNote> creditNotes = creditNoteRepository.findByInvoice_IdOrderByCreatedAtAscIdAsc(invoiceId);
        return InvoiceResponse.from(invoice, items, payments, creditNotes);
    }

    private void enforceReadAccess(UserPrincipal caller, UUID patientId) {
        Role role = caller.getRole();
        if (role == Role.ADMIN || role == Role.RECEPTIONIST) {
            return;
        }
        if (role == Role.PATIENT && caller.getPatientId() != null && caller.getPatientId().equals(patientId)) {
            return;
        }
        throw new ForbiddenException("Caller is not permitted to access this invoice");
    }

    private void enforceBillingStaff(UserPrincipal caller) {
        if (caller.getRole() != Role.ADMIN && caller.getRole() != Role.RECEPTIONIST) {
            throw new ForbiddenException("Only billing staff (ADMIN or RECEPTIONIST) may modify invoices");
        }
    }

    private String validateAndNormalizeTxnRef(PaymentMethod method, String rawTxnRef) {
        String trimmed = rawTxnRef == null ? null : rawTxnRef.trim();
        if (trimmed != null && trimmed.isEmpty()) {
            trimmed = null;
        }
        if (method != PaymentMethod.CASH) {
            if (trimmed == null) {
                throw new ValidationException("txnRef", "is required for " + method.name() + " payments");
            }
            if (trimmed.length() > 100) {
                throw new ValidationException("txnRef", "must be at most 100 characters");
            }
            return trimmed;
        }
        if (trimmed != null && trimmed.length() > 100) {
            throw new ValidationException("txnRef", "must be at most 100 characters");
        }
        return trimmed;
    }

    private String normalizeRequired(String raw, String fieldName, int minLength, int maxLength) {
        if (raw == null || raw.trim().isEmpty()) {
            throw new ValidationException(fieldName, "is required");
        }
        String trimmed = raw.trim();
        if (trimmed.length() < minLength || trimmed.length() > maxLength) {
            throw new ValidationException(
                    fieldName,
                    "must be between " + minLength + " and " + maxLength + " characters");
        }
        return trimmed;
    }

    private boolean isDuplicateTxnRefViolation(DataIntegrityViolationException ex) {
        Set<Throwable> visited = Collections.newSetFromMap(new IdentityHashMap<>());
        Throwable current = ex;
        while (current != null && visited.add(current)) {
            if (current instanceof ConstraintViolationException cve) {
                String constraintName = cve.getConstraintName();
                if (constraintName != null) {
                    return DUPLICATE_TXN_REF_CONSTRAINT.equalsIgnoreCase(constraintName);
                }
                if (isDuplicateTxnRefSqlException(cve.getSQLException())) {
                    return true;
                }
            }
            if (current instanceof SQLException sqlEx && isDuplicateTxnRefSqlException(sqlEx)) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }

    private boolean isDuplicateTxnRefSqlException(SQLException sqlException) {
        SQLException current = sqlException;
        while (current != null) {
            if (POSTGRES_UNIQUE_VIOLATION_SQL_STATE.equals(current.getSQLState())
                    && current.getMessage() != null
                    && current.getMessage().toLowerCase(Locale.ROOT).contains(DUPLICATE_TXN_REF_CONSTRAINT)) {
                return true;
            }
            current = current.getNextException();
        }
        return false;
    }

    private Specification<Invoice> buildListSpecification(
            List<InvoiceStatus> statuses,
            UUID patientId,
            Instant from,
            Instant to) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (statuses != null && !statuses.isEmpty()) {
                predicates.add(root.get("status").in(statuses));
            }
            if (patientId != null) {
                predicates.add(cb.equal(root.get("patient").get("id"), patientId));
            }
            if (from != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from));
            }
            if (to != null) {
                predicates.add(cb.lessThan(root.get("createdAt"), to));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private String truncate(String value, int maxLength) {
        return value.length() > maxLength ? value.substring(0, maxLength) : value;
    }

    public record InvoicePdfDownload(String invoiceNumber, byte[] pdfBytes) {
    }
}
