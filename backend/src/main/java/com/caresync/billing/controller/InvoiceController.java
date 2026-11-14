package com.caresync.billing.controller;

import com.caresync.billing.dto.CreditNoteRequest;
import com.caresync.billing.dto.CreditNoteResponse;
import com.caresync.billing.dto.InvoiceItemRequest;
import com.caresync.billing.dto.InvoiceItemResponse;
import com.caresync.billing.dto.InvoiceResponse;
import com.caresync.billing.dto.InvoiceSummary;
import com.caresync.billing.dto.PaymentRequest;
import com.caresync.billing.dto.PaymentResponse;
import com.caresync.billing.dto.VoidInvoiceRequest;
import com.caresync.billing.entity.InvoiceStatus;
import com.caresync.billing.service.InvoiceService;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.security.SecurityUtils;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for Hospital & Clinic Management System (HCMS) billing: invoices, items, counter payments,
 * credit notes, voiding, and PDF downloads.
 */
@RestController
@RequestMapping("/api")
@Validated
public class InvoiceController {

    private final InvoiceService invoiceService;

    public InvoiceController(InvoiceService invoiceService) {
        this.invoiceService = invoiceService;
    }

    @GetMapping("/invoices")
    public PageResponse<InvoiceSummary> listInvoices(
            @RequestParam(required = false) @Size(min = 1) List<InvoiceStatus> status,
            @RequestParam(required = false) UUID patientId,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return invoiceService.listInvoices(
                SecurityUtils.requireCurrentPrincipal(),
                status,
                patientId,
                from,
                to,
                page,
                size);
    }

    @GetMapping("/invoices/{invoiceId}")
    public InvoiceResponse getInvoice(@PathVariable UUID invoiceId) {
        return invoiceService.getInvoice(SecurityUtils.requireCurrentPrincipal(), invoiceId);
    }

    @GetMapping("/appointments/{appointmentId}/invoice")
    public InvoiceResponse getAppointmentInvoice(@PathVariable UUID appointmentId) {
        return invoiceService.getAppointmentInvoice(SecurityUtils.requireCurrentPrincipal(), appointmentId);
    }

    @GetMapping("/invoices/{invoiceId}/pdf")
    public ResponseEntity<byte[]> getInvoicePdf(@PathVariable UUID invoiceId) {
        InvoiceService.InvoicePdfDownload pdf = invoiceService.getInvoicePdf(
                SecurityUtils.requireCurrentPrincipal(),
                invoiceId);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .cacheControl(CacheControl.noStore())
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment()
                                .filename("invoice-" + pdf.invoiceNumber() + ".pdf")
                                .build()
                                .toString())
                .body(pdf.pdfBytes());
    }

    @PostMapping("/invoices/{invoiceId}/items")
    @ResponseStatus(HttpStatus.CREATED)
    public InvoiceItemResponse addInvoiceItem(
            @PathVariable UUID invoiceId,
            @Valid @RequestBody InvoiceItemRequest request) {
        return invoiceService.addInvoiceItem(SecurityUtils.requireCurrentPrincipal(), invoiceId, request);
    }

    @PostMapping("/invoices/{invoiceId}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public PaymentResponse recordPayment(
            @PathVariable UUID invoiceId,
            @Valid @RequestBody PaymentRequest request) {
        return invoiceService.recordPayment(SecurityUtils.requireCurrentPrincipal(), invoiceId, request);
    }

    @PostMapping("/invoices/{invoiceId}/credit-notes")
    @ResponseStatus(HttpStatus.CREATED)
    public CreditNoteResponse createCreditNote(
            @PathVariable UUID invoiceId,
            @Valid @RequestBody CreditNoteRequest request) {
        return invoiceService.createCreditNote(SecurityUtils.requireCurrentPrincipal(), invoiceId, request);
    }

    @PostMapping("/invoices/{invoiceId}/void")
    public InvoiceResponse voidInvoice(
            @PathVariable UUID invoiceId,
            @Valid @RequestBody VoidInvoiceRequest request) {
        return invoiceService.voidInvoice(SecurityUtils.requireCurrentPrincipal(), invoiceId, request);
    }
}
