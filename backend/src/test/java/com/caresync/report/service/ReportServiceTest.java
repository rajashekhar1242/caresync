package com.caresync.report.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.caresync.billing.entity.Currency;
import com.caresync.common.config.CareSyncProperties;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.reference.entity.Clinic;
import com.caresync.reference.repository.ClinicRepository;
import com.caresync.report.dto.AppointmentCounts;
import com.caresync.report.dto.AppointmentsByDepartmentResponse;
import com.caresync.report.dto.DashboardSummaryResponse;
import com.caresync.report.dto.DepartmentAppointmentCounts;
import com.caresync.report.dto.NoShowRateResponse;
import com.caresync.report.dto.ReportGroupBy;
import com.caresync.report.dto.RevenueReportResponse;
import com.caresync.report.dto.TopDoctorRankBy;
import com.caresync.report.dto.TopDoctorsResponse;
import com.caresync.report.repository.ReportRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ReportServiceTest {

    private static final Instant FIXED_NOW = Instant.parse("2026-11-12T10:00:00Z");

    @Mock
    private ReportRepository reportRepository;

    @Mock
    private ClinicRepository clinicRepository;

    private ReportService reportService;

    @BeforeEach
    void setUp() {
        CareSyncProperties properties = new CareSyncProperties(
                new CareSyncProperties.Jwt("secret", 900, 604800),
                new CareSyncProperties.Cors(List.of("http://localhost:3000")),
                new CareSyncProperties.RateLimit(5, 10, 20, 30),
                new CareSyncProperties.Reporting("Asia/Kolkata"),
                null);
        reportService = new ReportService(
                reportRepository,
                clinicRepository,
                properties,
                Clock.fixed(FIXED_NOW, ZoneOffset.UTC));
    }

    @Test
    void validatesDateRangeBeforeClinicLookupAndAllows366InclusiveDays() {
        UUID unknownClinic = UUID.randomUUID();
        LocalDate from = LocalDate.of(2026, 11, 1);
        LocalDate toBeforeFrom = LocalDate.of(2026, 10, 31);

        assertThatThrownBy(() -> reportService.getRevenueReport(from, toBeforeFrom, unknownClinic, ReportGroupBy.DAY))
                .isInstanceOf(ValidationException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.VALIDATION_FAILED);

        LocalDate overLimitEnd = LocalDate.of(2024, 1, 1).plusDays(366);
        assertThatThrownBy(() -> reportService.getNoShowRateReport(
                LocalDate.of(2024, 1, 1), overLimitEnd, unknownClinic))
                .isInstanceOf(ValidationException.class)
                .extracting("errorCode").isEqualTo(ErrorCode.VALIDATION_FAILED);

        // Exactly 366 inclusive days (leap year 2024-01-01 to 2024-12-31) reaches clinic lookup
        when(clinicRepository.findById(unknownClinic)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> reportService.getNoShowRateReport(
                LocalDate.of(2024, 1, 1), LocalDate.of(2024, 12, 31), unknownClinic))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void revenueReportFillsEmptyDaysMonthsAndHandlesNegativeNetSignedMoney() {
        LocalDate from = LocalDate.of(2026, 11, 1);
        LocalDate to = LocalDate.of(2026, 11, 3);
        when(reportRepository.aggregateInvoicedByPeriod(any(), any(), eq(null), eq("Asia/Kolkata"), eq("YYYY-MM-DD")))
                .thenReturn(Map.of("2026-11-01", new ReportRepository.InvoicedPeriodRow(2, new BigDecimal("1200.00"))));
        when(reportRepository.aggregateCollectedByPeriod(any(), any(), eq(null), eq("Asia/Kolkata"), eq("YYYY-MM-DD")))
                .thenReturn(Map.of("2026-11-01", new BigDecimal("600.00")));
        when(reportRepository.aggregateCreditedByPeriod(any(), any(), eq(null), eq("Asia/Kolkata"), eq("YYYY-MM-DD")))
                .thenReturn(Map.of("2026-11-03", new BigDecimal("800.00")));

        RevenueReportResponse daily = reportService.getRevenueReport(from, to, null, ReportGroupBy.DAY);
        assertThat(daily.currency()).isEqualTo(Currency.INR);
        assertThat(daily.timeZone()).isEqualTo("Asia/Kolkata");
        assertThat(daily.buckets()).hasSize(3);
        assertThat(daily.buckets().get(0).period()).isEqualTo("2026-11-01");
        assertThat(daily.buckets().get(0).net()).isEqualTo("600.00");
        assertThat(daily.buckets().get(1).period()).isEqualTo("2026-11-02");
        assertThat(daily.buckets().get(1).net()).isEqualTo("0.00");
        assertThat(daily.buckets().get(2).period()).isEqualTo("2026-11-03");
        assertThat(daily.buckets().get(2).net()).isEqualTo("-800.00");
        assertThat(daily.totals().invoiceCount()).isEqualTo(2);
        assertThat(daily.totals().invoiced()).isEqualTo("1200.00");
        assertThat(daily.totals().collected()).isEqualTo("600.00");
        assertThat(daily.totals().credited()).isEqualTo("800.00");
        assertThat(daily.totals().net()).isEqualTo("-200.00");

        when(reportRepository.aggregateInvoicedByPeriod(any(), any(), eq(null), eq("Asia/Kolkata"), eq("YYYY-MM")))
                .thenReturn(Map.of());
        when(reportRepository.aggregateCollectedByPeriod(any(), any(), eq(null), eq("Asia/Kolkata"), eq("YYYY-MM")))
                .thenReturn(Map.of());
        when(reportRepository.aggregateCreditedByPeriod(any(), any(), eq(null), eq("Asia/Kolkata"), eq("YYYY-MM")))
                .thenReturn(Map.of());
        RevenueReportResponse monthly = reportService.getRevenueReport(
                LocalDate.of(2026, 10, 20), LocalDate.of(2026, 12, 5), null, ReportGroupBy.MONTH);
        assertThat(monthly.buckets()).extracting("period").containsExactly("2026-10", "2026-11", "2026-12");
    }

    @Test
    void noShowRateDepartmentTotalsTopDoctorsAndDashboardUseClinicTimeZone() {
        UUID clinicId = UUID.randomUUID();
        when(clinicRepository.findById(clinicId))
                .thenReturn(Optional.of(new Clinic(clinicId, "Hyd", null, "Asia/Kolkata")));

        // Zero eligible -> ratePercent is null
        when(reportRepository.aggregateNoShowRate(any(), any(), eq(clinicId)))
                .thenReturn(new ReportRepository.NoShowAggregateRow(0, 0));
        NoShowRateResponse emptyNoShow = reportService.getNoShowRateReport(
                LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 10), clinicId);
        assertThat(emptyNoShow.eligible()).isZero();
        assertThat(emptyNoShow.ratePercent()).isNull();

        // Rounding HALF_UP to 2 decimals: 1 / 16 * 100 = 6.25
        when(reportRepository.aggregateNoShowRate(any(), any(), eq(clinicId)))
                .thenReturn(new ReportRepository.NoShowAggregateRow(15, 1));
        NoShowRateResponse computedNoShow = reportService.getNoShowRateReport(
                LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 10), clinicId);
        assertThat(computedNoShow.eligible()).isEqualTo(16);
        assertThat(computedNoShow.ratePercent()).isEqualByComparingTo("6.25");

        // Appointments by department totals sum across departments
        when(reportRepository.aggregateAppointmentsByDepartment(any(), any(), eq(clinicId))).thenReturn(List.of(
                new DepartmentAppointmentCounts(UUID.randomUUID(), "Cardiology", 5, 1, 1, 0, 2, 1, 0),
                new DepartmentAppointmentCounts(UUID.randomUUID(), "Pediatrics", 0, 0, 0, 0, 0, 0, 0)));
        AppointmentsByDepartmentResponse byDept = reportService.getAppointmentsByDepartmentReport(
                LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 10), clinicId);
        assertThat(byDept.totals().total()).isEqualTo(5);
        assertThat(byDept.totals().completed()).isEqualTo(2);

        // Top doctors assigns 1-based sequential ranks
        UUID d1 = UUID.randomUUID();
        UUID d2 = UUID.randomUUID();
        when(reportRepository.aggregateTopDoctors(any(), any(), eq(clinicId), eq(TopDoctorRankBy.COLLECTED_REVENUE), eq(5)))
                .thenReturn(List.of(
                        new ReportRepository.TopDoctorRow(d1, "Dr. Alpha", UUID.randomUUID(), "Cardiology", 4, 1, new BigDecimal("2400.00")),
                        new ReportRepository.TopDoctorRow(d2, "Dr. Beta", UUID.randomUUID(), "General Medicine", 5, 0, new BigDecimal("1500.00"))));
        TopDoctorsResponse top = reportService.getTopDoctorsReport(
                LocalDate.of(2026, 11, 1), LocalDate.of(2026, 11, 10), clinicId, TopDoctorRankBy.COLLECTED_REVENUE, 5);
        assertThat(top.doctors()).hasSize(2);
        assertThat(top.doctors().get(0).rank()).isEqualTo(1);
        assertThat(top.doctors().get(1).rank()).isEqualTo(2);

        // Dashboard summary
        when(reportRepository.aggregateDashboardAppointments(any(), any(), eq(clinicId)))
                .thenReturn(new ReportRepository.DashboardAppointmentRow(new AppointmentCounts(3, 1, 1, 0, 1, 0, 0), 1));
        when(reportRepository.aggregateDashboardCollections(any(), any(), any(), eq(clinicId)))
                .thenReturn(new ReportRepository.DashboardCollectionsRow(new BigDecimal("600.00"), new BigDecimal("3600.00")));
        when(reportRepository.aggregateDashboardOutstanding(clinicId))
                .thenReturn(new ReportRepository.DashboardOutstandingRow(2, new BigDecimal("950.00")));
        when(reportRepository.countActiveDoctors(clinicId)).thenReturn(4L);

        DashboardSummaryResponse dash = reportService.getDashboardSummary(clinicId);
        assertThat(dash.today()).isEqualTo(LocalDate.of(2026, 11, 12));
        assertThat(dash.collectedToday()).isEqualTo("600.00");
        assertThat(dash.collectedThisMonth()).isEqualTo("3600.00");
        assertThat(dash.outstandingBalance()).isEqualTo("950.00");
        assertThat(dash.unpaidInvoiceCount()).isEqualTo(2);
        assertThat(dash.activeDoctors()).isEqualTo(4);
        verify(reportRepository).countActiveDoctors(clinicId);
    }
}
