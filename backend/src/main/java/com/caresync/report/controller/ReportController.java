package com.caresync.report.controller;

import com.caresync.report.dto.AppointmentsByDepartmentResponse;
import com.caresync.report.dto.DashboardSummaryResponse;
import com.caresync.report.dto.NoShowRateResponse;
import com.caresync.report.dto.ReportGroupBy;
import com.caresync.report.dto.RevenueReportResponse;
import com.caresync.report.dto.TopDoctorRankBy;
import com.caresync.report.dto.TopDoctorsResponse;
import com.caresync.report.service.ReportService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin-only analytics and operational dashboard endpoints.
 */
@RestController
@RequestMapping("/api/reports")
@PreAuthorize("hasRole('ADMIN')")
@Validated
public class ReportController {

    private final ReportService reportService;

    public ReportController(ReportService reportService) {
        this.reportService = reportService;
    }

    @GetMapping("/revenue")
    public RevenueReportResponse getRevenueReport(
            @RequestParam LocalDate from,
            @RequestParam LocalDate to,
            @RequestParam(required = false) UUID clinicId,
            @RequestParam(defaultValue = "DAY") ReportGroupBy groupBy) {
        return reportService.getRevenueReport(from, to, clinicId, groupBy);
    }

    @GetMapping("/appointments-by-department")
    public AppointmentsByDepartmentResponse getAppointmentsByDepartmentReport(
            @RequestParam LocalDate from,
            @RequestParam LocalDate to,
            @RequestParam(required = false) UUID clinicId) {
        return reportService.getAppointmentsByDepartmentReport(from, to, clinicId);
    }

    @GetMapping("/no-show-rate")
    public NoShowRateResponse getNoShowRateReport(
            @RequestParam LocalDate from,
            @RequestParam LocalDate to,
            @RequestParam(required = false) UUID clinicId) {
        return reportService.getNoShowRateReport(from, to, clinicId);
    }

    @GetMapping("/top-doctors")
    public TopDoctorsResponse getTopDoctorsReport(
            @RequestParam LocalDate from,
            @RequestParam LocalDate to,
            @RequestParam(required = false) UUID clinicId,
            @RequestParam(defaultValue = "COMPLETED_APPOINTMENTS") TopDoctorRankBy rankBy,
            @RequestParam(defaultValue = "5") @Min(1) @Max(20) int limit) {
        return reportService.getTopDoctorsReport(from, to, clinicId, rankBy, limit);
    }

    @GetMapping("/dashboard")
    public DashboardSummaryResponse getDashboardSummary(
            @RequestParam(required = false) UUID clinicId) {
        return reportService.getDashboardSummary(clinicId);
    }
}
