package com.caresync.report.repository;

import com.caresync.report.dto.AppointmentCounts;
import com.caresync.report.dto.DepartmentAppointmentCounts;
import com.caresync.report.dto.TopDoctorRankBy;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * SQL-side PostgreSQL aggregation queries for admin operational and financial reports.
 */
@Repository
public class ReportRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public ReportRepository(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, InvoicedPeriodRow> aggregateInvoicedByPeriod(
            Instant startUtc,
            Instant endUtc,
            UUID clinicId,
            String timeZone,
            String periodPattern) {
        String sql = """
                SELECT to_char(i.created_at AT TIME ZONE :tz, :pattern) AS period,
                       COUNT(*) AS invoice_count,
                       COALESCE(SUM(i.total), 0.00) AS invoiced
                FROM invoices i
                WHERE i.status <> 'VOID'
                  AND i.created_at >= :startUtc
                  AND i.created_at < :endUtc
                """
                + (clinicId != null ? " AND i.clinic_id = :clinicId " : "")
                + " GROUP BY period ";

        MapSqlParameterSource params = baseRangeParams(startUtc, endUtc, clinicId)
                .addValue("tz", timeZone)
                .addValue("pattern", periodPattern);

        Map<String, InvoicedPeriodRow> result = new HashMap<>();
        jdbc.query(sql, params, rs -> {
            String period = rs.getString("period");
            result.put(period, new InvoicedPeriodRow(
                    rs.getLong("invoice_count"),
                    rs.getBigDecimal("invoiced")));
        });
        return result;
    }

    public Map<String, BigDecimal> aggregateCollectedByPeriod(
            Instant startUtc,
            Instant endUtc,
            UUID clinicId,
            String timeZone,
            String periodPattern) {
        String sql = """
                SELECT to_char(p.created_at AT TIME ZONE :tz, :pattern) AS period,
                       COALESCE(SUM(p.amount), 0.00) AS collected
                FROM payments p
                JOIN invoices i ON p.invoice_id = i.id
                WHERE p.created_at >= :startUtc
                  AND p.created_at < :endUtc
                """
                + (clinicId != null ? " AND i.clinic_id = :clinicId " : "")
                + " GROUP BY period ";

        MapSqlParameterSource params = baseRangeParams(startUtc, endUtc, clinicId)
                .addValue("tz", timeZone)
                .addValue("pattern", periodPattern);

        Map<String, BigDecimal> result = new HashMap<>();
        jdbc.query(sql, params, rs -> {
            result.put(rs.getString("period"), rs.getBigDecimal("collected"));
        });
        return result;
    }

    public Map<String, BigDecimal> aggregateCreditedByPeriod(
            Instant startUtc,
            Instant endUtc,
            UUID clinicId,
            String timeZone,
            String periodPattern) {
        String sql = """
                SELECT to_char(cn.created_at AT TIME ZONE :tz, :pattern) AS period,
                       COALESCE(SUM(cn.amount), 0.00) AS credited
                FROM credit_notes cn
                JOIN invoices i ON cn.invoice_id = i.id
                WHERE cn.created_at >= :startUtc
                  AND cn.created_at < :endUtc
                """
                + (clinicId != null ? " AND i.clinic_id = :clinicId " : "")
                + " GROUP BY period ";

        MapSqlParameterSource params = baseRangeParams(startUtc, endUtc, clinicId)
                .addValue("tz", timeZone)
                .addValue("pattern", periodPattern);

        Map<String, BigDecimal> result = new HashMap<>();
        jdbc.query(sql, params, rs -> {
            result.put(rs.getString("period"), rs.getBigDecimal("credited"));
        });
        return result;
    }

    public List<DepartmentAppointmentCounts> aggregateAppointmentsByDepartment(
            Instant startUtc,
            Instant endUtc,
            UUID clinicId) {
        String sql = """
                SELECT dept.id AS department_id,
                       dept.name AS department_name,
                       COUNT(a.id) AS total,
                       COUNT(a.id) FILTER (WHERE a.status = 'BOOKED') AS booked,
                       COUNT(a.id) FILTER (WHERE a.status = 'CHECKED_IN') AS checked_in,
                       COUNT(a.id) FILTER (WHERE a.status = 'IN_CONSULTATION') AS in_consultation,
                       COUNT(a.id) FILTER (WHERE a.status = 'COMPLETED') AS completed,
                       COUNT(a.id) FILTER (WHERE a.status = 'CANCELLED') AS cancelled,
                       COUNT(a.id) FILTER (WHERE a.status = 'NO_SHOW') AS no_show
                FROM departments dept
                LEFT JOIN doctors d ON d.department_id = dept.id
                LEFT JOIN appointments a ON a.doctor_id = d.id
                    AND a.slot_start >= :startUtc
                    AND a.slot_start < :endUtc
                """
                + (clinicId != null ? " AND a.clinic_id = :clinicId " : "")
                + """
                GROUP BY dept.id, dept.name
                ORDER BY total DESC, dept.name ASC
                """;

        return jdbc.query(sql, baseRangeParams(startUtc, endUtc, clinicId), (rs, rowNum) ->
                new DepartmentAppointmentCounts(
                        rs.getObject("department_id", UUID.class),
                        rs.getString("department_name"),
                        rs.getLong("total"),
                        rs.getLong("booked"),
                        rs.getLong("checked_in"),
                        rs.getLong("in_consultation"),
                        rs.getLong("completed"),
                        rs.getLong("cancelled"),
                        rs.getLong("no_show")));
    }

    public NoShowAggregateRow aggregateNoShowRate(Instant startUtc, Instant endUtc, UUID clinicId) {
        String sql = """
                SELECT COUNT(*) FILTER (WHERE a.status = 'COMPLETED') AS completed,
                       COUNT(*) FILTER (WHERE a.status = 'NO_SHOW') AS no_show
                FROM appointments a
                WHERE a.slot_start >= :startUtc
                  AND a.slot_start < :endUtc
                """
                + (clinicId != null ? " AND a.clinic_id = :clinicId " : "");

        return jdbc.queryForObject(sql, baseRangeParams(startUtc, endUtc, clinicId), (rs, rowNum) ->
                new NoShowAggregateRow(
                        rs.getLong("completed"),
                        rs.getLong("no_show")));
    }

    public List<TopDoctorRow> aggregateTopDoctors(
            Instant startUtc,
            Instant endUtc,
            UUID clinicId,
            TopDoctorRankBy rankBy,
            int limit) {
        String clinicClauseAppt = clinicId != null ? " AND a.clinic_id = :clinicId " : "";
        String clinicClauseInv = clinicId != null ? " AND i.clinic_id = :clinicId " : "";
        String orderBy = rankBy == TopDoctorRankBy.COLLECTED_REVENUE
                ? "collected DESC, u.full_name ASC, d.id ASC"
                : "completed_appointments DESC, u.full_name ASC, d.id ASC";

        String sql = """
                WITH appt_stats AS (
                    SELECT a.doctor_id,
                           COUNT(*) FILTER (WHERE a.status = 'COMPLETED') AS completed_appointments,
                           COUNT(*) FILTER (WHERE a.status = 'NO_SHOW') AS no_shows
                    FROM appointments a
                    WHERE a.slot_start >= :startUtc
                      AND a.slot_start < :endUtc
                """
                + clinicClauseAppt
                + """
                    GROUP BY a.doctor_id
                ),
                pay_stats AS (
                    SELECT i.doctor_id,
                           COALESCE(SUM(p.amount), 0.00) AS collected
                    FROM payments p
                    JOIN invoices i ON p.invoice_id = i.id
                    WHERE p.created_at >= :startUtc
                      AND p.created_at < :endUtc
                """
                + clinicClauseInv
                + """
                    GROUP BY i.doctor_id
                )
                SELECT d.id AS doctor_id,
                       u.full_name AS doctor_name,
                       dept.id AS department_id,
                       dept.name AS department_name,
                       COALESCE(appt.completed_appointments, 0) AS completed_appointments,
                       COALESCE(appt.no_shows, 0) AS no_shows,
                       COALESCE(pay.collected, 0.00) AS collected
                FROM doctors d
                JOIN users u ON d.user_id = u.id
                JOIN departments dept ON d.department_id = dept.id
                LEFT JOIN appt_stats appt ON appt.doctor_id = d.id
                LEFT JOIN pay_stats pay ON pay.doctor_id = d.id
                WHERE COALESCE(appt.completed_appointments, 0) > 0
                   OR COALESCE(pay.collected, 0) > 0
                ORDER BY %s
                LIMIT :limit
                """.formatted(orderBy);

        MapSqlParameterSource params = baseRangeParams(startUtc, endUtc, clinicId)
                .addValue("limit", limit);

        return jdbc.query(sql, params, (rs, rowNum) -> new TopDoctorRow(
                rs.getObject("doctor_id", UUID.class),
                rs.getString("doctor_name"),
                rs.getObject("department_id", UUID.class),
                rs.getString("department_name"),
                rs.getLong("completed_appointments"),
                rs.getLong("no_shows"),
                rs.getBigDecimal("collected")));
    }

    public DashboardAppointmentRow aggregateDashboardAppointments(
            Instant todayStartUtc,
            Instant todayEndUtc,
            UUID clinicId) {
        String sql = """
                SELECT COUNT(*) FILTER (WHERE a.slot_start >= :todayStart AND a.slot_start < :todayEnd) AS total,
                       COUNT(*) FILTER (WHERE a.slot_start >= :todayStart AND a.slot_start < :todayEnd AND a.status = 'BOOKED') AS booked,
                       COUNT(*) FILTER (WHERE a.slot_start >= :todayStart AND a.slot_start < :todayEnd AND a.status = 'CHECKED_IN') AS checked_in,
                       COUNT(*) FILTER (WHERE a.slot_start >= :todayStart AND a.slot_start < :todayEnd AND a.status = 'IN_CONSULTATION') AS in_consultation,
                       COUNT(*) FILTER (WHERE a.slot_start >= :todayStart AND a.slot_start < :todayEnd AND a.status = 'COMPLETED') AS completed,
                       COUNT(*) FILTER (WHERE a.slot_start >= :todayStart AND a.slot_start < :todayEnd AND a.status = 'CANCELLED') AS cancelled,
                       COUNT(*) FILTER (WHERE a.slot_start >= :todayStart AND a.slot_start < :todayEnd AND a.status = 'NO_SHOW') AS no_show,
                       COUNT(*) FILTER (WHERE a.status = 'CHECKED_IN' AND a.checked_in_at >= :todayStart AND a.checked_in_at < :todayEnd) AS waiting_now
                FROM appointments a
                WHERE ((a.slot_start >= :todayStart AND a.slot_start < :todayEnd)
                    OR (a.status = 'CHECKED_IN' AND a.checked_in_at >= :todayStart AND a.checked_in_at < :todayEnd))
                """
                + (clinicId != null ? " AND a.clinic_id = :clinicId " : "");

        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("todayStart", Timestamp.from(todayStartUtc))
                .addValue("todayEnd", Timestamp.from(todayEndUtc));
        if (clinicId != null) {
            params.addValue("clinicId", clinicId);
        }

        return jdbc.queryForObject(sql, params, (rs, rowNum) -> new DashboardAppointmentRow(
                new AppointmentCounts(
                        rs.getLong("total"),
                        rs.getLong("booked"),
                        rs.getLong("checked_in"),
                        rs.getLong("in_consultation"),
                        rs.getLong("completed"),
                        rs.getLong("cancelled"),
                        rs.getLong("no_show")),
                rs.getLong("waiting_now")));
    }

    public DashboardCollectionsRow aggregateDashboardCollections(
            Instant monthStartUtc,
            Instant todayStartUtc,
            Instant todayEndUtc,
            UUID clinicId) {
        String sql = """
                SELECT COALESCE(SUM(p.amount) FILTER (WHERE p.created_at >= :todayStart AND p.created_at < :todayEnd), 0.00) AS collected_today,
                       COALESCE(SUM(p.amount), 0.00) AS collected_this_month
                FROM payments p
                JOIN invoices i ON p.invoice_id = i.id
                WHERE p.created_at >= :monthStart
                  AND p.created_at < :todayEnd
                """
                + (clinicId != null ? " AND i.clinic_id = :clinicId " : "");

        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("monthStart", Timestamp.from(monthStartUtc))
                .addValue("todayStart", Timestamp.from(todayStartUtc))
                .addValue("todayEnd", Timestamp.from(todayEndUtc));
        if (clinicId != null) {
            params.addValue("clinicId", clinicId);
        }

        return jdbc.queryForObject(sql, params, (rs, rowNum) -> new DashboardCollectionsRow(
                rs.getBigDecimal("collected_today"),
                rs.getBigDecimal("collected_this_month")));
    }

    public DashboardOutstandingRow aggregateDashboardOutstanding(UUID clinicId) {
        String sql = """
                SELECT COUNT(*) AS unpaid_count,
                       COALESCE(SUM(i.total - i.amount_paid), 0.00) AS outstanding_balance
                FROM invoices i
                WHERE i.status IN ('PENDING', 'PARTIALLY_PAID')
                """
                + (clinicId != null ? " AND i.clinic_id = :clinicId " : "");

        MapSqlParameterSource params = new MapSqlParameterSource();
        if (clinicId != null) {
            params.addValue("clinicId", clinicId);
        }

        return jdbc.queryForObject(sql, params, (rs, rowNum) -> new DashboardOutstandingRow(
                rs.getLong("unpaid_count"),
                rs.getBigDecimal("outstanding_balance")));
    }

    public long countActiveDoctors(UUID clinicId) {
        String sql = "SELECT COUNT(*) FROM doctors d WHERE d.active = TRUE"
                + (clinicId != null ? " AND d.clinic_id = :clinicId" : "");
        MapSqlParameterSource params = new MapSqlParameterSource();
        if (clinicId != null) {
            params.addValue("clinicId", clinicId);
        }
        Long count = jdbc.queryForObject(sql, params, Long.class);
        return count != null ? count : 0L;
    }

    private MapSqlParameterSource baseRangeParams(Instant startUtc, Instant endUtc, UUID clinicId) {
        MapSqlParameterSource params = new MapSqlParameterSource()
                .addValue("startUtc", Timestamp.from(startUtc))
                .addValue("endUtc", Timestamp.from(endUtc));
        if (clinicId != null) {
            params.addValue("clinicId", clinicId);
        }
        return params;
    }

    public record InvoicedPeriodRow(long invoiceCount, BigDecimal invoiced) {
    }

    public record NoShowAggregateRow(long completed, long noShow) {
    }

    public record TopDoctorRow(
            UUID doctorId,
            String doctorName,
            UUID departmentId,
            String departmentName,
            long completedAppointments,
            long noShows,
            BigDecimal collected) {
    }

    public record DashboardAppointmentRow(AppointmentCounts appointmentsToday, long waitingNow) {
    }

    public record DashboardCollectionsRow(BigDecimal collectedToday, BigDecimal collectedThisMonth) {
    }

    public record DashboardOutstandingRow(long unpaidInvoiceCount, BigDecimal outstandingBalance) {
    }
}
