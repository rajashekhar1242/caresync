package com.caresync.report;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.config.RequestLoggingFilter;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.testsupport.BaseIntegrationTest;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.UUID;
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

class ReportIT extends BaseIntegrationTest {

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
    void reportsAggregateAccuratelyAcrossTimezonesFiltersAndDashboard() throws Exception {
        UUID adminUserId = UUID.fromString("00000000-0000-4000-8000-000000000001");
        String adminJwt = jwtService.generateAccessToken(new UserPrincipal(
                adminUserId, "admin-test@caresync.local", "Admin", Role.ADMIN, null, null));
        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.fromString("00000000-0000-4000-8000-000000000002"),
                "receptionist-test@caresync.local", "Receptionist", Role.RECEPTIONIST, null, null));

        String unique = UUID.randomUUID().toString().substring(0, 8);
        UUID specId = jdbcTemplate.queryForObject("SELECT id FROM specializations ORDER BY name LIMIT 1", UUID.class);
        UUID clinic1Id = jdbcTemplate.queryForObject("SELECT id FROM clinics ORDER BY name LIMIT 1", UUID.class);
        UUID clinic2Id = jdbcTemplate.queryForObject("SELECT id FROM clinics ORDER BY name DESC LIMIT 1", UUID.class);
        ZoneId clinicZone = ZoneId.of(jdbcTemplate.queryForObject(
                "SELECT time_zone FROM clinics WHERE id = ?", String.class, clinic1Id));

        // Capture dashboard baseline before inserting ReportIT fixtures (shared Testcontainers DB)
        JsonNode dashBefore = jsonMapper.readTree(mockMvc.perform(get("/api/reports/dashboard")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("clinicId", clinic1Id.toString()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        UUID deptId = createDepartment(adminJwt, "ReportDept-" + unique);
        UUID activeDocId = createDoctor(adminJwt, "Dr. Rep Active " + unique, "rep.act." + unique + "@caresync.local",
                specId, clinic1Id, deptId, "600.00", true);
        UUID inactiveDocId = createDoctor(adminJwt, "Dr. Rep Inactive " + unique, "rep.inact." + unique + "@caresync.local",
                specId, clinic1Id, deptId, "400.00", false);
        UUID noShowOnlyDocId = createDoctor(adminJwt, "Dr. Rep NoShow " + unique, "rep.ns." + unique + "@caresync.local",
                specId, clinic1Id, deptId, "500.00", true);
        UUID clinic2DocId = createDoctor(adminJwt, "Dr. Rep Clinic2 " + unique, "rep.c2." + unique + "@caresync.local",
                specId, clinic2Id, deptId, "900.00", true);

        UUID patientId = registerPatient("RepPatient-" + unique, "pat.rep." + unique + "@example.com");

        // Isolated historical window in 2025 so other ITs cannot interfere
        LocalDate d1 = LocalDate.of(2025, 1, 10);
        LocalDate d2 = LocalDate.of(2025, 1, 11);
        LocalDate d3 = LocalDate.of(2025, 1, 12);

        Instant d1Slot = d1.atTime(LocalTime.of(10, 0)).atZone(clinicZone).toInstant();
        Instant d1LateSlot = d1.atTime(LocalTime.of(11, 0)).atZone(clinicZone).toInstant();
        Instant d2Slot = d2.atTime(LocalTime.of(10, 0)).atZone(clinicZone).toInstant();
        Instant d3Slot = d3.atTime(LocalTime.of(10, 0)).atZone(clinicZone).toInstant();

        // clinic1 appointments in Jan 10..12 2025:
        // activeDoc: 2 COMPLETED, 1 NO_SHOW, 1 CANCELLED
        // inactiveDoc: 1 COMPLETED
        // noShowOnlyDoc: 1 NO_SHOW (0 completed, 0 collected -> excluded from top-doctors)
        // clinic2Doc (different clinic): 1 COMPLETED on d1 (excluded when clinicId = clinic1Id)
        UUID apptComp1 = insertAppointment(activeDocId, patientId, clinic1Id, d1Slot, "COMPLETED", null);
        UUID apptComp2 = insertAppointment(activeDocId, patientId, clinic1Id, d1LateSlot, "COMPLETED", null);
        insertAppointment(activeDocId, patientId, clinic1Id, d2Slot, "NO_SHOW", null);
        insertAppointment(activeDocId, patientId, clinic1Id, d3Slot, "CANCELLED", null);
        UUID apptInactive = insertAppointment(inactiveDocId, patientId, clinic1Id, d2Slot, "COMPLETED", null);
        insertAppointment(noShowOnlyDocId, patientId, clinic1Id, d2Slot, "NO_SHOW", null);
        insertAppointment(clinic2DocId, patientId, clinic2Id, d1Slot, "COMPLETED", null);

        // Invoices:
        // d1: inv1 PAID 600.00 (activeDoc), paid on d1; credit note 800.00? Wait: CN cannot exceed total -> put 800.00 invoice paid on d1, CN 500 on d3 -> d3 net is -500.00!
        UUID inv1 = insertInvoice("INV-2025-900001-" + unique.substring(0, 4), apptComp1, patientId, activeDocId, clinic1Id,
                "PAID", new BigDecimal("600.00"), new BigDecimal("600.00"), new BigDecimal("0.00"), d1Slot);
        insertPayment(inv1, new BigDecimal("600.00"), "CASH", adminUserId, d1Slot);

        UUID invInactive = insertInvoice("INV-2025-900002-" + unique.substring(0, 4), apptInactive, patientId, inactiveDocId, clinic1Id,
                "PAID", new BigDecimal("900.00"), new BigDecimal("900.00"), new BigDecimal("900.00"), d2Slot);
        insertPayment(invInactive, new BigDecimal("900.00"), "UPI", adminUserId, d2Slot);
        // Credit note on d3 causes negative net on d3 (-900.00)
        insertCreditNote("CN-2025-900001-" + unique.substring(0, 4), invInactive, new BigDecimal("900.00"),
                "Full correction on d3", adminUserId, d3Slot);

        // Void invoice on d1 must NEVER count in revenue report
        insertInvoice("INV-2025-900003-" + unique.substring(0, 4), apptComp2, patientId, activeDocId, clinic1Id,
                "VOID", new BigDecimal("700.00"), new BigDecimal("0.00"), new BigDecimal("0.00"), d1Slot);

        // Today dashboard fixtures in clinic1: +1 waitingNow, +1 unpaidInvoice, +450.00 outstanding, +300.00 collected today
        LocalDate clinicToday = LocalDate.now(clinicZone);
        Instant todayMorning = clinicToday.atTime(LocalTime.of(9, 0)).atZone(clinicZone).toInstant();
        insertAppointment(activeDocId, patientId, clinic1Id, todayMorning, "CHECKED_IN", todayMorning);
        insertInvoice("INV-TD-" + unique, apptComp2, patientId, activeDocId, clinic1Id,
                "PENDING", new BigDecimal("450.00"), new BigDecimal("0.00"), new BigDecimal("0.00"), Instant.now());
        UUID paidTodayInv = insertInvoice("INV-PT-" + unique, apptComp1, patientId, activeDocId, clinic1Id,
                "PAID", new BigDecimal("300.00"), new BigDecimal("300.00"), new BigDecimal("0.00"), Instant.now());
        insertPayment(paidTodayInv, new BigDecimal("300.00"), "CASH", adminUserId, Instant.now());

        // 1. Authorization check precedence: non-ADMIN gets 403 even with invalid dates or unknown clinicId
        mockMvc.perform(get("/api/reports/revenue")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .param("from", "2025-01-12")
                        .param("to", "2025-01-10")
                        .param("clinicId", UUID.randomUUID().toString()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        // 400 before 404 for ADMIN with from > to
        mockMvc.perform(get("/api/reports/no-show-rate")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("from", "2025-01-12")
                        .param("to", "2025-01-10")
                        .param("clinicId", UUID.randomUUID().toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        // 404 unknown clinicId
        mockMvc.perform(get("/api/reports/dashboard")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("clinicId", UUID.randomUUID().toString()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));

        // 2. Revenue report (DAY) verifies VOID exclusion, empty gap day? (all 3 days), negative net SignedMoney
        mockMvc.perform(get("/api/reports/revenue")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("from", "2025-01-10")
                        .param("to", "2025-01-12")
                        .param("clinicId", clinic1Id.toString())
                        .param("groupBy", "DAY"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currency").value("INR"))
                .andExpect(jsonPath("$.buckets.length()").value(3))
                .andExpect(jsonPath("$.buckets[0].period").value("2025-01-10"))
                .andExpect(jsonPath("$.buckets[0].invoiceCount").value(1))
                .andExpect(jsonPath("$.buckets[0].invoiced").value("600.00"))
                .andExpect(jsonPath("$.buckets[0].collected").value("600.00"))
                .andExpect(jsonPath("$.buckets[0].net").value("600.00"))
                .andExpect(jsonPath("$.buckets[2].period").value("2025-01-12"))
                .andExpect(jsonPath("$.buckets[2].credited").value("900.00"))
                .andExpect(jsonPath("$.buckets[2].net").value("-900.00"))
                .andExpect(jsonPath("$.totals.invoiceCount").value(2))
                .andExpect(jsonPath("$.totals.invoiced").value("1500.00"))
                .andExpect(jsonPath("$.totals.collected").value("1500.00"))
                .andExpect(jsonPath("$.totals.credited").value("900.00"))
                .andExpect(jsonPath("$.totals.net").value("600.00"));

        // 3. Appointments by department includes empty seeded departments & counts all clinic1 statuses accurately
        mockMvc.perform(get("/api/reports/appointments-by-department")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("from", "2025-01-10")
                        .param("to", "2025-01-12")
                        .param("clinicId", clinic1Id.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totals.total").value(6))
                .andExpect(jsonPath("$.totals.completed").value(3))
                .andExpect(jsonPath("$.totals.noShow").value(2))
                .andExpect(jsonPath("$.totals.cancelled").value(1))
                .andExpect(jsonPath("$.departments[0].departmentId").value(deptId.toString()))
                .andExpect(jsonPath("$.departments[0].completed").value(3));

        // 4. No-show rate: eligible = 3 completed + 2 noShow = 5 -> 2/5 * 100 = 40.00
        mockMvc.perform(get("/api/reports/no-show-rate")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("from", "2025-01-10")
                        .param("to", "2025-01-12")
                        .param("clinicId", clinic1Id.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.completed").value(3))
                .andExpect(jsonPath("$.noShow").value(2))
                .andExpect(jsonPath("$.eligible").value(5))
                .andExpect(jsonPath("$.ratePercent").value(40.0));

        // Empty window returns null ratePercent
        mockMvc.perform(get("/api/reports/no-show-rate")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("from", "2024-05-01")
                        .param("to", "2024-05-05")
                        .param("clinicId", clinic1Id.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eligible").value(0))
                .andExpect(jsonPath("$.ratePercent").isEmpty());

        // 5. Top doctors: COMPLETED_APPOINTMENTS puts activeDoc (2) over inactiveDoc (1); COLLECTED_REVENUE puts inactiveDoc (900) over activeDoc (600); noShowOnlyDoc omitted!
        mockMvc.perform(get("/api/reports/top-doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("from", "2025-01-10")
                        .param("to", "2025-01-12")
                        .param("clinicId", clinic1Id.toString())
                        .param("rankBy", "COMPLETED_APPOINTMENTS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.doctors.length()").value(2))
                .andExpect(jsonPath("$.doctors[0].rank").value(1))
                .andExpect(jsonPath("$.doctors[0].doctorId").value(activeDocId.toString()))
                .andExpect(jsonPath("$.doctors[1].doctorId").value(inactiveDocId.toString()));

        mockMvc.perform(get("/api/reports/top-doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("from", "2025-01-10")
                        .param("to", "2025-01-12")
                        .param("clinicId", clinic1Id.toString())
                        .param("rankBy", "COLLECTED_REVENUE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.doctors[0].doctorId").value(inactiveDocId.toString()))
                .andExpect(jsonPath("$.doctors[0].collected").value("900.00"))
                .andExpect(jsonPath("$.doctors[1].doctorId").value(activeDocId.toString()));

        // 6. Dashboard summary reflects exact baseline + fixture deltas (including waitingNow and outstandingBalance)
        JsonNode dashAfter = jsonMapper.readTree(mockMvc.perform(get("/api/reports/dashboard")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("clinicId", clinic1Id.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clinicId").value(clinic1Id.toString()))
                .andReturn().getResponse().getContentAsString());

        assertThat(dashAfter.get("waitingNow").asLong())
                .isEqualTo(dashBefore.get("waitingNow").asLong() + 1);
        assertThat(dashAfter.get("unpaidInvoiceCount").asLong())
                .isEqualTo(dashBefore.get("unpaidInvoiceCount").asLong() + 1);
        assertThat(dashAfter.get("activeDoctors").asLong())
                .isEqualTo(dashBefore.get("activeDoctors").asLong() + 2);
        assertThat(new BigDecimal(dashAfter.get("outstandingBalance").asString()))
                .isEqualByComparingTo(new BigDecimal(dashBefore.get("outstandingBalance").asString()).add(new BigDecimal("450.00")));
        assertThat(new BigDecimal(dashAfter.get("collectedToday").asString()))
                .isEqualByComparingTo(new BigDecimal(dashBefore.get("collectedToday").asString()).add(new BigDecimal("300.00")));
        assertThat(new BigDecimal(dashAfter.get("collectedThisMonth").asString()))
                .isEqualByComparingTo(new BigDecimal(dashBefore.get("collectedThisMonth").asString()).add(new BigDecimal("300.00")));
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

    private UUID createDoctor(
            String adminJwt, String name, String email, UUID specId, UUID clinicId, UUID deptId, String fee, boolean active)
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
        UUID doctorId = UUID.fromString(jsonMapper.readTree(res.getResponse().getContentAsString()).get("id").asString());
        if (!active) {
            jdbcTemplate.update("UPDATE doctors SET active = FALSE WHERE id = ?", doctorId);
        }
        return doctorId;
    }

    private UUID registerPatient(String name, String email) throws Exception {
        MvcResult res = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"%s","email":"%s","password":"Password!123"}
                                """.formatted(name, email)))
                .andExpect(status().isCreated())
                .andReturn();
        JsonNode node = jsonMapper.readTree(res.getResponse().getContentAsString());
        return UUID.fromString(node.get("user").get("patientId").asString());
    }

    private UUID insertAppointment(
            UUID doctorId, UUID patientId, UUID clinicId, Instant slotStart, String status, Instant checkedInAt) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO appointments (id, doctor_id, patient_id, clinic_id, slot_start, slot_end, status, checked_in_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                id, doctorId, patientId, clinicId, Timestamp.from(slotStart), Timestamp.from(slotStart.plusSeconds(900)),
                status, checkedInAt != null ? Timestamp.from(checkedInAt) : null);
        return id;
    }

    private UUID insertInvoice(
            String invoiceNumber, UUID apptId, UUID patientId, UUID doctorId, UUID clinicId,
            String status, BigDecimal total, BigDecimal amountPaid, BigDecimal creditedTotal, Instant createdAt) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO invoices (id, invoice_number, appointment_id, patient_id, doctor_id, clinic_id, status, currency, total, amount_paid, credited_total, paid_at, created_at, updated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, 'INR', ?, ?, ?, ?, ?, ?)",
                id, invoiceNumber, apptId, patientId, doctorId, clinicId, status, total, amountPaid, creditedTotal,
                "PAID".equals(status) ? Timestamp.from(createdAt) : null,
                Timestamp.from(createdAt), Timestamp.from(createdAt));
        return id;
    }

    private void insertPayment(UUID invoiceId, BigDecimal amount, String method, UUID receivedBy, Instant createdAt) {
        jdbcTemplate.update(
                "INSERT INTO payments (id, invoice_id, amount, method, txn_ref, received_by, received_by_name, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, 'Admin', ?)",
                UUID.randomUUID(), invoiceId, amount, method,
                "CASH".equals(method) ? null : "REF-" + UUID.randomUUID().toString().substring(0, 8),
                receivedBy, Timestamp.from(createdAt));
    }

    private void insertCreditNote(
            String cnNumber, UUID invoiceId, BigDecimal amount, String reason, UUID createdBy, Instant createdAt) {
        jdbcTemplate.update(
                "INSERT INTO credit_notes (id, credit_note_number, invoice_id, amount, reason, created_by, created_by_name, created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, 'Admin', ?)",
                UUID.randomUUID(), cnNumber, invoiceId, amount, reason, createdBy, Timestamp.from(createdAt));
    }
}
