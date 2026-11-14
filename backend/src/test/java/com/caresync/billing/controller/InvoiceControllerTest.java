package com.caresync.billing.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.billing.dto.InvoiceItemResponse;
import com.caresync.billing.dto.InvoiceResponse;
import com.caresync.billing.dto.InvoiceSummary;
import com.caresync.billing.dto.PaymentResponse;
import com.caresync.billing.entity.Currency;
import com.caresync.billing.entity.InvoiceStatus;
import com.caresync.billing.entity.PaymentMethod;
import com.caresync.billing.service.InvoiceService;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.testsupport.SecuritySliceTestConfig;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(InvoiceController.class)
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class InvoiceControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private InvoiceService invoiceService;

    @BeforeEach
    void setUp() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void enforcesAuthValidationAndPdfHeaders() throws Exception {
        mockMvc.perform(get("/api/invoices"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "front@caresync.local", "Front Desk", Role.RECEPTIONIST, null, null));

        UUID invoiceId = UUID.randomUUID();
        UUID apptId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();
        Instant now = Instant.parse("2026-11-12T10:00:00Z");

        when(invoiceService.listInvoices(any(), any(), any(), any(), any(), eq(0), eq(20)))
                .thenReturn(new PageResponse<>(List.of(new InvoiceSummary(
                        invoiceId, "INV-2026-000001", apptId, patientId, "Asha Reddy", "Dr. Rao",
                        InvoiceStatus.PENDING, Currency.INR, "600.00", "0.00", "600.00",
                        now, null, null)), 0, 20, 1, 1));

        mockMvc.perform(get("/api/invoices")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].invoiceNumber").value("INV-2026-000001"));

        mockMvc.perform(post("/api/invoices/{id}/items", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"description":"ECG","quantity":1,"unitPrice":"bad"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors[0].field").value("unitPrice"));

        when(invoiceService.addInvoiceItem(any(), eq(invoiceId), any()))
                .thenReturn(new InvoiceItemResponse(UUID.randomUUID(), "ECG", 1, "350.00", "350.00", now));
        mockMvc.perform(post("/api/invoices/{id}/items", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"description":"ECG","quantity":1,"unitPrice":"350.00"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.lineTotal").value("350.00"));

        when(invoiceService.recordPayment(any(), eq(invoiceId), any()))
                .thenReturn(new PaymentResponse(
                        UUID.randomUUID(), invoiceId, "500.00", Currency.INR, PaymentMethod.UPI,
                        "UPI-123", "Front Desk", now));
        mockMvc.perform(post("/api/invoices/{id}/payments", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":"500.00","method":"UPI","txnRef":"UPI-123"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.amount").value("500.00"));

        byte[] samplePdf = "%PDF-1.4 sample".getBytes(StandardCharsets.US_ASCII);
        when(invoiceService.getInvoicePdf(any(), eq(invoiceId)))
                .thenReturn(new InvoiceService.InvoicePdfDownload("INV-2026-000001", samplePdf));
        mockMvc.perform(get("/api/invoices/{id}/pdf", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(header().string(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"invoice-INV-2026-000001.pdf\""))
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(content().bytes(samplePdf));

        when(invoiceService.getAppointmentInvoice(any(), eq(apptId)))
                .thenReturn(new InvoiceResponse(
                        invoiceId, "INV-2026-000001", apptId, patientId, "Asha Reddy", "Dr. Rao",
                        InvoiceStatus.PENDING, Currency.INR, "600.00", "0.00", "600.00",
                        now, null, null, UUID.randomUUID(), UUID.randomUUID(),
                        List.of(), List.of(), List.of(), "0.00", "600.00", now));
        mockMvc.perform(get("/api/appointments/{id}/invoice", apptId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.invoiceNumber").value("INV-2026-000001"));
    }
}
