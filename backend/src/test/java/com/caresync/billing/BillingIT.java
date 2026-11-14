package com.caresync.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.config.RequestLoggingFilter;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.testsupport.BaseIntegrationTest;
import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class BillingIT extends BaseIntegrationTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JsonMapper jsonMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @Autowired
    private RequestLoggingFilter requestLoggingFilter;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(requestLoggingFilter, rateLimitFilter)
                .apply(springSecurity())
                .build();
        rateLimitFilter.clearBuckets();
    }

    @Test
    void fullBillingLifecycleAutoInvoicePaymentsCreditNotesVoidPdfAndAuthorization() throws Exception {
        String adminJwt = adminToken();
        String receptionistJwt = receptionistToken();
        String unique = UUID.randomUUID().toString().substring(0, 8);

        UUID specId = jdbcTemplate.queryForObject("SELECT id FROM specializations ORDER BY name LIMIT 1", UUID.class);
        UUID clinicId = jdbcTemplate.queryForObject("SELECT id FROM clinics ORDER BY name LIMIT 1", UUID.class);
        ZoneId zone = ZoneId.of(jdbcTemplate.queryForObject("SELECT time_zone FROM clinics WHERE id = ?", String.class, clinicId));
        LocalDate clinicToday = LocalDate.now(zone);

        UUID deptId = createDepartment(adminJwt, "BillDept-" + unique);
        DoctorSetup paidDoc = createDoctor(adminJwt, "Dr. Bill " + unique, "doc.bill." + unique + "@caresync.local",
                specId, clinicId, deptId, "600.00");
        DoctorSetup freeDoc = createDoctor(adminJwt, "Dr. Free " + unique, "doc.free." + unique + "@caresync.local",
                specId, clinicId, deptId, "0.00");

        PatientSetup pat1 = registerPatient("PatOne-" + unique, "pat1.bill." + unique + "@example.com");
        PatientSetup pat2 = registerPatient("PatTwo-" + unique, "pat2.bill." + unique + "@example.com");

        // Completed appointment with paid doctor -> auto-creates PENDING invoice
        UUID appt1 = createCompletedAppointment(
                receptionistJwt, paidDoc, pat1.patientId(), clinicId,
                clinicToday.atTime(LocalTime.of(9, 0)).atZone(zone).toInstant());

        // Check appointment invoice: DOCTOR -> 403, other patient -> 403, patient -> 200
        mockMvc.perform(get("/api/appointments/{id}/invoice", appt1)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + paidDoc.jwt()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/appointments/{id}/invoice", appt1)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + pat2.jwt()))
                .andExpect(status().isForbidden());

        MvcResult invRes = mockMvc.perform(get("/api/appointments/{id}/invoice", appt1)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + pat1.jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.currency").value("INR"))
                .andExpect(jsonPath("$.total").value("600.00"))
                .andExpect(jsonPath("$.amountPaid").value("0.00"))
                .andExpect(jsonPath("$.balance").value("600.00"))
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].unitPrice").value("600.00"))
                .andReturn();
        JsonNode invJson = jsonMapper.readTree(invRes.getResponse().getContentAsString());
        UUID invoiceId = UUID.fromString(invJson.get("id").asString());
        String invoiceNumber = invJson.get("invoiceNumber").asString();
        assertThat(invoiceNumber).startsWith("INV-");

        // List invoices scoping & date check
        mockMvc.perform(get("/api/invoices")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + pat1.jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1));
        mockMvc.perform(get("/api/invoices")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + pat1.jwt())
                        .param("patientId", pat2.patientId().toString()))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/invoices")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("from", "2026-11-12T10:00:00Z")
                        .param("to", "2026-11-12T10:00:00Z"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        // Add line item (quantity=2, unitPrice=350.00 -> lineTotal=700.00, new total=1300.00)
        mockMvc.perform(post("/api/invoices/{id}/items", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"description":"ECG Scan","quantity":2,"unitPrice":"350.00"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.lineTotal").value("700.00"));

        // Partial CASH payment -> PARTIALLY_PAID
        mockMvc.perform(post("/api/invoices/{id}/payments", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":"500.00","method":"CASH"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.method").value("CASH"));

        mockMvc.perform(get("/api/invoices/{id}", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PARTIALLY_PAID"))
                .andExpect(jsonPath("$.total").value("1300.00"))
                .andExpect(jsonPath("$.amountPaid").value("500.00"))
                .andExpect(jsonPath("$.balance").value("800.00"));

        // Void on PARTIALLY_PAID -> 409 INVOICE_HAS_PAYMENTS
        mockMvc.perform(post("/api/invoices/{id}/void", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reason":"Cannot void partially paid"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVOICE_HAS_PAYMENTS"));

        // Credit note before PAID -> 409 INVOICE_NOT_PAID
        mockMvc.perform(post("/api/invoices/{id}/credit-notes", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":"100.00","reason":"Early adjustment attempt"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVOICE_NOT_PAID"));

        // Overpayment -> 400 OVERPAYMENT
        mockMvc.perform(post("/api/invoices/{id}/payments", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":"800.01","method":"UPI","txnRef":"UPI-OVER-%s"}
                                """.formatted(unique)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("OVERPAYMENT"));

        // Remaining balance via UPI -> PAID
        String upiRef = "UPI-FULL-" + unique;
        mockMvc.perform(post("/api/invoices/{id}/payments", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":"800.00","method":"UPI","txnRef":"%s"}
                                """.formatted(upiRef)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.txnRef").value(upiRef));

        mockMvc.perform(get("/api/invoices/{id}", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + pat1.jwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.balance").value("0.00"))
                .andExpect(jsonPath("$.paidAt").isNotEmpty());

        // PAID is immutable for items, payments, and void
        mockMvc.perform(post("/api/invoices/{id}/items", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"description":"Late","quantity":1,"unitPrice":"100.00"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("INVOICE_IMMUTABLE"));

        // Credit note: RECEPTIONIST forbidden -> 403; ADMIN allowed up to total -> 201; exceeding -> 400 CREDIT_EXCEEDS_INVOICE
        mockMvc.perform(post("/api/invoices/{id}/credit-notes", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":"200.00","reason":"Unauthorized role attempt"}
                                """))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/api/invoices/{id}/credit-notes", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":"200.00","reason":"Duplicate ECG charged by mistake"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.creditNoteNumber").isNotEmpty())
                .andExpect(jsonPath("$.amount").value("200.00"));

        mockMvc.perform(post("/api/invoices/{id}/credit-notes", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":"1100.01","reason":"Exceeds remaining creditable amount"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CREDIT_EXCEEDS_INVOICE"));

        // PDF download
        MvcResult pdfRes = mockMvc.perform(get("/api/invoices/{id}/pdf", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + pat1.jwt())
                        .accept(MediaType.APPLICATION_PDF, MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(header().string(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"invoice-" + invoiceNumber + ".pdf\""))
                .andReturn();
        assertThat(new String(pdfRes.getResponse().getContentAsByteArray(), 0, 5, StandardCharsets.US_ASCII))
                .isEqualTo("%PDF-");

        // Zero-fee doctor completion -> invoice created immediately as PAID with total 0.00
        UUID freeAppt = createCompletedAppointment(
                receptionistJwt, freeDoc, pat1.patientId(), clinicId,
                clinicToday.atTime(LocalTime.of(10, 0)).atZone(zone).toInstant());
        mockMvc.perform(get("/api/appointments/{id}/invoice", freeAppt)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.total").value("0.00"))
                .andExpect(jsonPath("$.paidAt").isNotEmpty());

        // Voiding a PENDING invoice excludes it from GET /appointments/{id}/invoice
        UUID voidAppt = createCompletedAppointment(
                receptionistJwt, paidDoc, pat2.patientId(), clinicId,
                clinicToday.atTime(LocalTime.of(11, 0)).atZone(zone).toInstant());
        MvcResult voidTargetRes = mockMvc.perform(get("/api/appointments/{id}/invoice", voidAppt)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt))
                .andExpect(status().isOk())
                .andReturn();
        UUID voidInvId = UUID.fromString(jsonMapper.readTree(voidTargetRes.getResponse().getContentAsString()).get("id").asString());

        mockMvc.perform(post("/api/invoices/{id}/void", voidInvId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"reason":"Wrong patient was billed"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("VOID"))
                .andExpect(jsonPath("$.voidReason").value("Wrong patient was billed"));

        mockMvc.perform(get("/api/appointments/{id}/invoice", voidAppt)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

        // Verify all 7 invoice audit actions exist
        List<String> actions = jdbcTemplate.queryForList(
                "SELECT action FROM audit_logs WHERE entity_type = 'INVOICE'", String.class);
        assertThat(actions).contains(
                "INVOICE_CREATED",
                "INVOICE_READ",
                "INVOICE_ITEM_ADDED",
                "PAYMENT_RECORDED",
                "CREDIT_NOTE_ISSUED",
                "INVOICE_VOIDED",
                "INVOICE_PDF_DOWNLOADED");
    }

    @Test
    void concurrentPaymentsSerializedByRowLockPreventOverpaymentAndDuplicateTxnRefRace() throws Exception {
        String adminJwt = adminToken();
        String receptionistJwt = receptionistToken();
        String unique = UUID.randomUUID().toString().substring(0, 8);

        UUID specId = jdbcTemplate.queryForObject("SELECT id FROM specializations ORDER BY name LIMIT 1", UUID.class);
        UUID clinicId = jdbcTemplate.queryForObject("SELECT id FROM clinics ORDER BY name LIMIT 1", UUID.class);
        ZoneId zone = ZoneId.of(jdbcTemplate.queryForObject("SELECT time_zone FROM clinics WHERE id = ?", String.class, clinicId));
        LocalDate clinicToday = LocalDate.now(zone);

        UUID deptId = createDepartment(adminJwt, "RaceBillDept-" + unique);
        DoctorSetup doc = createDoctor(adminJwt, "Dr. RaceBill " + unique, "doc.rb." + unique + "@caresync.local",
                specId, clinicId, deptId, "500.00");
        PatientSetup pat = registerPatient("RacePat-" + unique, "pat.rb." + unique + "@example.com");

        UUID appt1 = createCompletedAppointment(
                receptionistJwt, doc, pat.patientId(), clinicId,
                clinicToday.atTime(LocalTime.of(12, 0)).atZone(zone).toInstant());
        UUID appt2 = createCompletedAppointment(
                receptionistJwt, doc, pat.patientId(), clinicId,
                clinicToday.atTime(LocalTime.of(12, 30)).atZone(zone).toInstant());

        UUID inv1 = UUID.fromString(jsonMapper.readTree(
                mockMvc.perform(get("/api/appointments/{id}/invoice", appt1)
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("id").asString());
        UUID inv2 = UUID.fromString(jsonMapper.readTree(
                mockMvc.perform(get("/api/appointments/{id}/invoice", appt2)
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("id").asString());

        // 1. Concurrent partial payments totaling 600.00 on a 500.00 invoice -> one 201, one 400 OVERPAYMENT
        List<Integer> payStatuses = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch gate = new CountDownLatch(1);
            Future<?> f1 = pool.submit(() -> {
                gate.await();
                payStatuses.add(mockMvc.perform(post("/api/invoices/{id}/payments", inv1)
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"amount":"300.00","method":"CASH"}
                                        """))
                        .andReturn().getResponse().getStatus());
                return null;
            });
            Future<?> f2 = pool.submit(() -> {
                gate.await();
                payStatuses.add(mockMvc.perform(post("/api/invoices/{id}/payments", inv1)
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"amount":"300.00","method":"CASH"}
                                        """))
                        .andReturn().getResponse().getStatus());
                return null;
            });
            gate.countDown();
            f1.get();
            f2.get();
        } finally {
            pool.shutdownNow();
        }
        assertThat(payStatuses).containsExactlyInAnyOrder(201, 400);
        Integer inv1PaymentCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM payments WHERE invoice_id = ?", Integer.class, inv1);
        assertThat(inv1PaymentCount).isEqualTo(1);

        // 2. Concurrent identical (UPI, txnRef) across two invoices -> one 201, one 409 DUPLICATE_TXN_REF
        String sharedRef = "UPI-SHARED-" + unique;
        List<Integer> refStatuses = Collections.synchronizedList(new ArrayList<>());
        ExecutorService refPool = Executors.newFixedThreadPool(2);
        try {
            CountDownLatch gate = new CountDownLatch(1);
            Future<?> f1 = refPool.submit(() -> {
                gate.await();
                refStatuses.add(mockMvc.perform(post("/api/invoices/{id}/payments", inv1)
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"amount":"100.00","method":"UPI","txnRef":"%s"}
                                        """.formatted(sharedRef)))
                        .andReturn().getResponse().getStatus());
                return null;
            });
            Future<?> f2 = refPool.submit(() -> {
                gate.await();
                refStatuses.add(mockMvc.perform(post("/api/invoices/{id}/payments", inv2)
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"amount":"100.00","method":"UPI","txnRef":"%s"}
                                        """.formatted(sharedRef)))
                        .andReturn().getResponse().getStatus());
                return null;
            });
            gate.countDown();
            f1.get();
            f2.get();
        } finally {
            refPool.shutdownNow();
        }
        assertThat(refStatuses).containsExactlyInAnyOrder(201, 409);
    }

    @Test
    void transactionRollbackPreventsPartialInvoiceOrPaymentWrites() throws Exception {
        String adminJwt = adminToken();
        String receptionistJwt = receptionistToken();
        String unique = UUID.randomUUID().toString().substring(0, 8);

        UUID specId = jdbcTemplate.queryForObject("SELECT id FROM specializations ORDER BY name LIMIT 1", UUID.class);
        UUID clinicId = jdbcTemplate.queryForObject("SELECT id FROM clinics ORDER BY name LIMIT 1", UUID.class);
        ZoneId zone = ZoneId.of(jdbcTemplate.queryForObject("SELECT time_zone FROM clinics WHERE id = ?", String.class, clinicId));
        LocalDate clinicToday = LocalDate.now(zone);

        UUID deptId = createDepartment(adminJwt, "RollbackDept-" + unique);
        DoctorSetup doc = createDoctor(adminJwt, "Dr. Rollback " + unique, "doc.rbk." + unique + "@caresync.local",
                specId, clinicId, deptId, "500.00");
        PatientSetup pat = registerPatient("RollbackPat-" + unique, "pat.rbk." + unique + "@example.com");

        // Incomplete consultation (missing diagnosis) blocks COMPLETED and creates zero invoice rows
        Instant slot = clinicToday.atTime(LocalTime.of(14, 0)).atZone(zone).toInstant();
        UUID incompleteAppt = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status) VALUES (?, ?, ?, ?, ?, ?, 'IN_CONSULTATION')",
                incompleteAppt, doc.doctorId(), pat.patientId(), clinicId, Timestamp.from(slot), Timestamp.from(slot.plusSeconds(900)));

        mockMvc.perform(patch("/api/appointments/{id}/status", incompleteAppt)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doc.jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"COMPLETED"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("CONSULTATION_INCOMPLETE"));

        Integer invoiceCountForIncomplete = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM invoices WHERE appointment_id = ?", Integer.class, incompleteAppt);
        assertThat(invoiceCountForIncomplete).isZero();

        // Complete consultation properly on that same appointment, then verify rejected payment leaves zero payment or audit rows
        mockMvc.perform(post("/api/appointments/{id}/consultation", incompleteAppt)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doc.jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"diagnosis":"Routine consultation completed"}
                                """))
                .andExpect(status().isCreated());
        mockMvc.perform(patch("/api/appointments/{id}/status", incompleteAppt)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doc.jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"COMPLETED"}
                                """))
                .andExpect(status().isOk());
        UUID invoiceId = UUID.fromString(jsonMapper.readTree(
                mockMvc.perform(get("/api/appointments/{id}/invoice", incompleteAppt)
                                .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt))
                        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("id").asString());

        Integer auditBefore = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM audit_logs WHERE entity_id = ?", Integer.class, invoiceId);
        mockMvc.perform(post("/api/invoices/{id}/payments", invoiceId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"amount":"999.00","method":"CASH"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("OVERPAYMENT"));

        Integer payCountAfter = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM payments WHERE invoice_id = ?", Integer.class, invoiceId);
        Integer auditAfter = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM audit_logs WHERE entity_id = ?", Integer.class, invoiceId);
        String statusAfter = jdbcTemplate.queryForObject(
                "SELECT status FROM invoices WHERE id = ?", String.class, invoiceId);

        assertThat(payCountAfter).isZero();
        assertThat(auditAfter).isEqualTo(auditBefore);
        assertThat(statusAfter).isEqualTo("PENDING");
    }

    private String adminToken() {
        return jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000001"),
                "admin-test@caresync.local", "Admin", Role.ADMIN, null, null));
    }

    private String receptionistToken() {
        return jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000002"),
                "receptionist-test@caresync.local", "Receptionist", Role.RECEPTIONIST, null, null));
    }

    private UUID createDepartment(String adminJwt, String name) throws Exception {
        MvcResult res = mockMvc.perform(post("/api/departments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"%s"}
                                """.formatted(name)))
                .andExpect(status().isCreated())
                .andReturn();
        return UUID.fromString(jsonMapper.readTree(res.getResponse().getContentAsString()).get("id").asString());
    }

    private DoctorSetup createDoctor(
            String adminJwt, String name, String email, UUID specId, UUID clinicId, UUID deptId, String fee)
            throws Exception {
        MvcResult res = mockMvc.perform(post("/api/doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fullName":"%s",
                                  "email":"%s",
                                  "password":"Password!123",
                                  "specializationId":"%s",
                                  "clinicId":"%s",
                                  "departmentId":"%s",
                                  "consultationFee":"%s",
                                  "slotMinutes":15
                                }
                                """.formatted(name, email, specId, clinicId, deptId, fee)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode node = jsonMapper.readTree(res.getResponse().getContentAsString());
        UUID docId = UUID.fromString(node.get("id").asString());
        UUID userId = UUID.fromString(node.get("userId").asString());
        String jwt = jwtService.generateAccessToken(
                new UserPrincipal(userId, email, name, Role.DOCTOR, null, docId));
        return new DoctorSetup(docId, userId, jwt);
    }

    private PatientSetup registerPatient(String name, String email) throws Exception {
        MvcResult res = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"%s","email":"%s","password":"Password!123"}
                                """.formatted(name, email)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode node = jsonMapper.readTree(res.getResponse().getContentAsString());
        UUID patientId = UUID.fromString(node.get("user").get("patientId").asString());
        return new PatientSetup(patientId, node.get("accessToken").asString());
    }

    private UUID createCompletedAppointment(
            String receptionistJwt, DoctorSetup doc, UUID patientId, UUID clinicId, Instant slotStart)
            throws Exception {
        UUID apptId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status) VALUES (?, ?, ?, ?, ?, ?, 'BOOKED')",
                apptId, doc.doctorId(), patientId, clinicId, Timestamp.from(slotStart), Timestamp.from(slotStart.plusSeconds(900)));

        mockMvc.perform(patch("/api/appointments/{id}/status", apptId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"CHECKED_IN"}
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(patch("/api/appointments/{id}/status", apptId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doc.jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"IN_CONSULTATION"}
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/appointments/{id}/consultation", apptId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doc.jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"diagnosis":"Routine consultation completed"}
                                """))
                .andExpect(status().isCreated());

        mockMvc.perform(patch("/api/appointments/{id}/status", apptId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doc.jwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"status":"COMPLETED"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));
        return apptId;
    }

    private record DoctorSetup(UUID doctorId, UUID userId, String jwt) {
    }

    private record PatientSetup(UUID patientId, String jwt) {
    }
}
