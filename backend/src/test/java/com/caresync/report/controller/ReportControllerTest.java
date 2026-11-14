package com.caresync.report.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.billing.entity.Currency;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.report.dto.AppointmentCounts;
import com.caresync.report.dto.DashboardSummaryResponse;
import com.caresync.report.dto.ReportGroupBy;
import com.caresync.report.dto.RevenueFigures;
import com.caresync.report.dto.RevenueReportResponse;
import com.caresync.report.service.ReportService;
import com.caresync.testsupport.SecuritySliceTestConfig;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(ReportController.class)
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class ReportControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private ReportService reportService;

    @BeforeEach
    void setUp() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void restrictsReportsToAdminAndValidatesParameters() throws Exception {
        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "front@caresync.local", "Front Desk", Role.RECEPTIONIST, null, null));
        String doctorJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "doc@caresync.local", "Dr. Rao", Role.DOCTOR, null, UUID.randomUUID()));
        String patientJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "pat@caresync.local", "Asha", Role.PATIENT, UUID.randomUUID(), null));
        String adminJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "admin@caresync.local", "Admin", Role.ADMIN, null, null));

        // 403 first even if clinicId or query parameters are invalid
        mockMvc.perform(get("/api/reports/revenue")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .param("from", "2026-11-10")
                        .param("to", "2026-11-01"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        mockMvc.perform(get("/api/reports/dashboard")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + doctorJwt))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/reports/no-show-rate")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt)
                        .param("from", "2026-11-01")
                        .param("to", "2026-11-10"))
                .andExpect(status().isForbidden());

        verifyNoInteractions(reportService);

        // 400 on out-of-range limit
        mockMvc.perform(get("/api/reports/top-doctors")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("from", "2026-11-01")
                        .param("to", "2026-11-10")
                        .param("limit", "25"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        when(reportService.getRevenueReport(
                LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 10), null, ReportGroupBy.DAY))
                .thenReturn(new RevenueReportResponse(
                        LocalDate.of(2026, 11, 1),
                        LocalDate.of(2026, 11, 10),
                        "Asia/Kolkata",
                        null,
                        ReportGroupBy.DAY,
                        Currency.INR,
                        new RevenueFigures(0, "0.00", "0.00", "0.00", "0.00"),
                        List.of()));

        mockMvc.perform(get("/api/reports/revenue")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .param("from", "2026-11-01")
                        .param("to", "2026-11-10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.currency").value("INR"));

        when(reportService.getDashboardSummary(any())).thenReturn(new DashboardSummaryResponse(
                null, "Asia/Kolkata", LocalDate.of(2026, 11, 12), Instant.parse("2026-11-12T10:00:00Z"),
                new AppointmentCounts(0, 0, 0, 0, 0, 0, 0), 0,
                Currency.INR, "0.00", "0.00", "0.00", 0, 1));

        mockMvc.perform(get("/api/reports/dashboard")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeDoctors").value(1));
    }
}
