package com.caresync.report.service;

import com.caresync.billing.entity.Currency;
import com.caresync.common.config.CareSyncProperties;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.util.MoneyUtils;
import com.caresync.common.util.TimeZoneUtils;
import com.caresync.reference.entity.Clinic;
import com.caresync.reference.repository.ClinicRepository;
import com.caresync.report.dto.AppointmentCounts;
import com.caresync.report.dto.AppointmentsByDepartmentResponse;
import com.caresync.report.dto.DashboardSummaryResponse;
import com.caresync.report.dto.DepartmentAppointmentCounts;
import com.caresync.report.dto.NoShowRateResponse;
import com.caresync.report.dto.ReportGroupBy;
import com.caresync.report.dto.RevenueBucket;
import com.caresync.report.dto.RevenueFigures;
import com.caresync.report.dto.RevenueReportResponse;
import com.caresync.report.dto.TopDoctorEntry;
import com.caresync.report.dto.TopDoctorRankBy;
import com.caresync.report.dto.TopDoctorsResponse;
import com.caresync.report.repository.ReportRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Service building admin financial, operational, and dashboard reports using PostgreSQL aggregations.
 */
@Service
@Transactional(readOnly = true)
public class ReportService {

    private static final long MAX_RANGE_DAYS_INCLUSIVE = 366L;
    private static final DateTimeFormatter MONTH_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM");

    private final ReportRepository reportRepository;
    private final ClinicRepository clinicRepository;
    private final CareSyncProperties properties;
    private final Clock clock;

    public ReportService(
            ReportRepository reportRepository,
            ClinicRepository clinicRepository,
            CareSyncProperties properties,
            Clock clock) {
        this.reportRepository = reportRepository;
        this.clinicRepository = clinicRepository;
        this.properties = properties;
        this.clock = clock;
    }

    public RevenueReportResponse getRevenueReport(
            LocalDate from,
            LocalDate to,
            UUID clinicId,
            ReportGroupBy groupBy) {
        validateDateRange(from, to);
        ReportScopeContext scope = resolveScope(clinicId);
        Instant startUtc = TimeZoneUtils.startOfDayUtc(from, scope.zoneId());
        Instant endUtc = TimeZoneUtils.exclusiveEndOfDayUtc(to, scope.zoneId());
        String pgPattern = groupBy == ReportGroupBy.MONTH ? "YYYY-MM" : "YYYY-MM-DD";

        Map<String, ReportRepository.InvoicedPeriodRow> invoicedByPeriod =
                reportRepository.aggregateInvoicedByPeriod(startUtc, endUtc, clinicId, scope.timeZone(), pgPattern);
        Map<String, BigDecimal> collectedByPeriod =
                reportRepository.aggregateCollectedByPeriod(startUtc, endUtc, clinicId, scope.timeZone(), pgPattern);
        Map<String, BigDecimal> creditedByPeriod =
                reportRepository.aggregateCreditedByPeriod(startUtc, endUtc, clinicId, scope.timeZone(), pgPattern);

        List<String> expectedPeriods = enumeratePeriods(from, to, groupBy);
        List<RevenueBucket> buckets = new ArrayList<>(expectedPeriods.size());

        long totalInvoices = 0L;
        BigDecimal totalInvoiced = MoneyUtils.ZERO;
        BigDecimal totalCollected = MoneyUtils.ZERO;
        BigDecimal totalCredited = MoneyUtils.ZERO;

        for (String period : expectedPeriods) {
            ReportRepository.InvoicedPeriodRow invRow = invoicedByPeriod.get(period);
            long invoiceCount = invRow != null ? invRow.invoiceCount() : 0L;
            BigDecimal invoiced = invRow != null ? invRow.invoiced() : MoneyUtils.ZERO;
            BigDecimal collected = collectedByPeriod.getOrDefault(period, MoneyUtils.ZERO);
            BigDecimal credited = creditedByPeriod.getOrDefault(period, MoneyUtils.ZERO);
            BigDecimal net = collected.subtract(credited);

            totalInvoices += invoiceCount;
            totalInvoiced = totalInvoiced.add(invoiced);
            totalCollected = totalCollected.add(collected);
            totalCredited = totalCredited.add(credited);

            buckets.add(new RevenueBucket(
                    period,
                    invoiceCount,
                    MoneyUtils.format(invoiced),
                    MoneyUtils.format(collected),
                    MoneyUtils.format(credited),
                    MoneyUtils.formatSigned(net)));
        }

        BigDecimal totalNet = totalCollected.subtract(totalCredited);
        RevenueFigures totals = new RevenueFigures(
                totalInvoices,
                MoneyUtils.format(totalInvoiced),
                MoneyUtils.format(totalCollected),
                MoneyUtils.format(totalCredited),
                MoneyUtils.formatSigned(totalNet));

        return new RevenueReportResponse(
                from,
                to,
                scope.timeZone(),
                clinicId,
                groupBy,
                Currency.INR,
                totals,
                buckets);
    }

    public AppointmentsByDepartmentResponse getAppointmentsByDepartmentReport(
            LocalDate from,
            LocalDate to,
            UUID clinicId) {
        validateDateRange(from, to);
        ReportScopeContext scope = resolveScope(clinicId);
        Instant startUtc = TimeZoneUtils.startOfDayUtc(from, scope.zoneId());
        Instant endUtc = TimeZoneUtils.exclusiveEndOfDayUtc(to, scope.zoneId());

        List<DepartmentAppointmentCounts> departments =
                reportRepository.aggregateAppointmentsByDepartment(startUtc, endUtc, clinicId);

        long total = 0;
        long booked = 0;
        long checkedIn = 0;
        long inConsultation = 0;
        long completed = 0;
        long cancelled = 0;
        long noShow = 0;
        for (DepartmentAppointmentCounts dept : departments) {
            total += dept.total();
            booked += dept.booked();
            checkedIn += dept.checkedIn();
            inConsultation += dept.inConsultation();
            completed += dept.completed();
            cancelled += dept.cancelled();
            noShow += dept.noShow();
        }

        AppointmentCounts totals = new AppointmentCounts(
                total, booked, checkedIn, inConsultation, completed, cancelled, noShow);

        return new AppointmentsByDepartmentResponse(
                from,
                to,
                scope.timeZone(),
                clinicId,
                totals,
                departments);
    }

    public NoShowRateResponse getNoShowRateReport(
            LocalDate from,
            LocalDate to,
            UUID clinicId) {
        validateDateRange(from, to);
        ReportScopeContext scope = resolveScope(clinicId);
        Instant startUtc = TimeZoneUtils.startOfDayUtc(from, scope.zoneId());
        Instant endUtc = TimeZoneUtils.exclusiveEndOfDayUtc(to, scope.zoneId());

        ReportRepository.NoShowAggregateRow row =
                reportRepository.aggregateNoShowRate(startUtc, endUtc, clinicId);
        long completed = row.completed();
        long noShow = row.noShow();
        long eligible = completed + noShow;

        BigDecimal ratePercent = eligible == 0
                ? null
                : BigDecimal.valueOf(noShow)
                        .multiply(BigDecimal.valueOf(100))
                        .divide(BigDecimal.valueOf(eligible), 2, RoundingMode.HALF_UP);

        return new NoShowRateResponse(
                from,
                to,
                scope.timeZone(),
                clinicId,
                completed,
                noShow,
                eligible,
                ratePercent);
    }

    public TopDoctorsResponse getTopDoctorsReport(
            LocalDate from,
            LocalDate to,
            UUID clinicId,
            TopDoctorRankBy rankBy,
            int limit) {
        validateDateRange(from, to);
        ReportScopeContext scope = resolveScope(clinicId);
        Instant startUtc = TimeZoneUtils.startOfDayUtc(from, scope.zoneId());
        Instant endUtc = TimeZoneUtils.exclusiveEndOfDayUtc(to, scope.zoneId());

        List<ReportRepository.TopDoctorRow> rows =
                reportRepository.aggregateTopDoctors(startUtc, endUtc, clinicId, rankBy, limit);
        List<TopDoctorEntry> entries = new ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            ReportRepository.TopDoctorRow row = rows.get(i);
            entries.add(new TopDoctorEntry(
                    i + 1,
                    row.doctorId(),
                    row.doctorName(),
                    row.departmentId(),
                    row.departmentName(),
                    row.completedAppointments(),
                    row.noShows(),
                    MoneyUtils.format(row.collected())));
        }

        return new TopDoctorsResponse(
                from,
                to,
                scope.timeZone(),
                clinicId,
                rankBy,
                Currency.INR,
                entries);
    }

    public DashboardSummaryResponse getDashboardSummary(UUID clinicId) {
        ReportScopeContext scope = resolveScope(clinicId);
        Instant now = Instant.now(clock);
        LocalDate today = TimeZoneUtils.todayInZone(scope.zoneId(), clock);
        Instant todayStartUtc = TimeZoneUtils.startOfDayUtc(today, scope.zoneId());
        Instant todayEndUtc = TimeZoneUtils.exclusiveEndOfDayUtc(today, scope.zoneId());
        Instant monthStartUtc = TimeZoneUtils.startOfDayUtc(today.withDayOfMonth(1), scope.zoneId());

        ReportRepository.DashboardAppointmentRow apptRow =
                reportRepository.aggregateDashboardAppointments(todayStartUtc, todayEndUtc, clinicId);
        ReportRepository.DashboardCollectionsRow collRow =
                reportRepository.aggregateDashboardCollections(monthStartUtc, todayStartUtc, todayEndUtc, clinicId);
        ReportRepository.DashboardOutstandingRow outRow =
                reportRepository.aggregateDashboardOutstanding(clinicId);
        long activeDoctors = reportRepository.countActiveDoctors(clinicId);

        return new DashboardSummaryResponse(
                clinicId,
                scope.timeZone(),
                today,
                now,
                apptRow.appointmentsToday(),
                apptRow.waitingNow(),
                Currency.INR,
                MoneyUtils.format(collRow.collectedToday()),
                MoneyUtils.format(collRow.collectedThisMonth()),
                MoneyUtils.format(outRow.outstandingBalance()),
                outRow.unpaidInvoiceCount(),
                activeDoctors);
    }

    private void validateDateRange(LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw new ValidationException("from", "must not be after to");
        }
        long inclusiveDays = ChronoUnit.DAYS.between(from, to) + 1;
        if (inclusiveDays > MAX_RANGE_DAYS_INCLUSIVE) {
            throw new ValidationException("to", "date range must not exceed 366 days");
        }
    }

    private ReportScopeContext resolveScope(UUID clinicId) {
        String timeZone;
        if (clinicId != null) {
            Clinic clinic = clinicRepository.findById(clinicId)
                    .orElseThrow(() -> new ResourceNotFoundException("Clinic not found"));
            timeZone = clinic.getTimeZone();
        } else {
            timeZone = properties.reporting().timeZone();
        }
        return new ReportScopeContext(timeZone, TimeZoneUtils.resolveZone(timeZone));
    }

    private List<String> enumeratePeriods(LocalDate from, LocalDate to, ReportGroupBy groupBy) {
        List<String> periods = new ArrayList<>();
        if (groupBy == ReportGroupBy.MONTH) {
            YearMonth current = YearMonth.from(from);
            YearMonth end = YearMonth.from(to);
            while (!current.isAfter(end)) {
                periods.add(current.format(MONTH_FORMATTER));
                current = current.plusMonths(1);
            }
        } else {
            LocalDate current = from;
            while (!current.isAfter(to)) {
                periods.add(current.toString());
                current = current.plusDays(1);
            }
        }
        return periods;
    }

    private record ReportScopeContext(String timeZone, ZoneId zoneId) {
    }
}
