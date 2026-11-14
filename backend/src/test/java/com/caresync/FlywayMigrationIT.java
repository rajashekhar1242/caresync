package com.caresync;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.caresync.testsupport.BaseIntegrationTest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Savepoint;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

class FlywayMigrationIT extends BaseIntegrationTest {

    @Autowired
    private DataSource dataSource;

    @Autowired(required = false)
    private org.flywaydb.core.Flyway flyway;

    @Test
    void allMigrationsAppliedAndSeedDataPresent() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Integer appliedCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE success = true", Integer.class);
        assertThat(appliedCount).isGreaterThanOrEqualTo(12);

        Integer clinicCount = jdbc.queryForObject("SELECT COUNT(*) FROM clinics", Integer.class);
        Integer specializationCount = jdbc.queryForObject("SELECT COUNT(*) FROM specializations", Integer.class);
        Integer medicineCount = jdbc.queryForObject("SELECT COUNT(*) FROM medicines", Integer.class);
        Integer interactionCount = jdbc.queryForObject("SELECT COUNT(*) FROM drug_interactions", Integer.class);
        Integer staffCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM users WHERE role IN ('ADMIN', 'RECEPTIONIST')", Integer.class);
        UUID clopiletId = jdbc.queryForObject(
                "SELECT id FROM medicines WHERE name = 'Clopilet 75'", UUID.class);
        String clopiletOmezInteraction = jdbc.queryForObject("""
                SELECT di.severity
                FROM drug_interactions di
                JOIN medicines ma ON ma.id = di.medicine_a_id
                JOIN medicines mb ON mb.id = di.medicine_b_id
                WHERE ma.name = 'Clopilet 75' AND mb.name = 'Omez 20'
                """, String.class);

        assertThat(clinicCount).isEqualTo(3);
        assertThat(specializationCount).isEqualTo(8);
        assertThat(medicineCount).isEqualTo(20);
        assertThat(interactionCount).isEqualTo(8);
        assertThat(staffCount).isEqualTo(2);
        assertThat(clopiletId).isEqualTo(UUID.fromString("10000000-0000-4000-8000-000000000009"));
        assertThat(clopiletOmezInteraction).isEqualTo("MODERATE");
    }

    @Test
    void auditLogsTableAllowsInsertsAndRejectsUpdatesAndDeletes() throws SQLException {
        UUID auditId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        UUID entityId = UUID.randomUUID();

        try (Connection conn = dataSource.getConnection()) {
            boolean originalAutoCommit = conn.getAutoCommit();
            conn.setAutoCommit(false);
            try {
                try (PreparedStatement insert = conn.prepareStatement("""
                        INSERT INTO audit_logs (id, user_id, user_name, user_role, action, entity_type, entity_id, details)
                        VALUES (?, ?, 'Dr. Audit', 'DOCTOR', 'PATIENT_READ', 'PATIENT', ?, 'append-only test')
                        """)) {
                    insert.setObject(1, auditId);
                    insert.setObject(2, userId);
                    insert.setObject(3, entityId);
                    assertThat(insert.executeUpdate()).isEqualTo(1);
                }

                Savepoint updateSavepoint = conn.setSavepoint("before_update");
                try (PreparedStatement update = conn.prepareStatement(
                        "UPDATE audit_logs SET details = 'tampered' WHERE id = ?")) {
                    update.setObject(1, auditId);
                    assertThatThrownBy(update::executeUpdate)
                            .isInstanceOf(SQLException.class)
                            .hasMessageContaining("append-only");
                } finally {
                    conn.rollback(updateSavepoint);
                }

                Savepoint deleteSavepoint = conn.setSavepoint("before_delete");
                try (PreparedStatement delete = conn.prepareStatement(
                        "DELETE FROM audit_logs WHERE id = ?")) {
                    delete.setObject(1, auditId);
                    assertThatThrownBy(delete::executeUpdate)
                            .isInstanceOf(SQLException.class)
                            .hasMessageContaining("append-only");
                } finally {
                    conn.rollback(deleteSavepoint);
                }
            } finally {
                conn.rollback();
                conn.setAutoCommit(originalAutoCommit);
            }
        }
    }

    @Test
    void flywaySecondStartupIsIdempotentAndConstraintsAndStaffSentinelsVerified() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        // 1. Verify staff accounts are present with active BCrypt hashes from bootstrap runner
        java.util.List<String> staffHashes = jdbc.query(
                "SELECT password_hash FROM users WHERE role IN ('ADMIN', 'RECEPTIONIST') ORDER BY email",
                (rs, rowNum) -> rs.getString("password_hash"));
        assertThat(staffHashes).hasSize(2);
        for (String hash : staffHashes) {
            assertThat(hash).startsWith("$2");
        }

        // 2. Verify partial unique indexes exist
        Integer indexCount = jdbc.queryForObject("""
                SELECT COUNT(*) FROM pg_indexes 
                WHERE indexname IN ('uq_appointment_slot_active', 'uq_appointment_doctor_in_consultation', 'uq_payment_method_txn_ref')
                """, Integer.class);
        assertThat(indexCount).isEqualTo(3);

        // 3. Verify append-only trigger exists on audit_logs
        Integer triggerCount = jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.triggers 
                WHERE event_object_table = 'audit_logs' AND trigger_name = 'trg_protect_audit_logs_append_only'
                   OR (event_object_table = 'audit_logs' AND trigger_name LIKE '%audit%')
                """, Integer.class);
        assertThat(triggerCount).isGreaterThanOrEqualTo(1);

        // 4. Verify second startup idempotency: running Flyway.migrate() again applies 0 new migrations
        if (flyway != null) {
            org.flywaydb.core.api.output.MigrateResult secondRun = flyway.migrate();
            assertThat(secondRun.migrationsExecuted).isEqualTo(0);
        }
    }

    @Test
    void demoSeedScriptExecutesCleanlyAndIsIdempotent() throws Exception {
        java.nio.file.Path seedPath = java.nio.file.Path.of("../deploy/demo-seed.sql");
        org.junit.jupiter.api.Assumptions.assumeTrue(java.nio.file.Files.exists(seedPath), "deploy/demo-seed.sql must exist");

        String sql = java.nio.file.Files.readString(seedPath);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        // Execute first time
        jdbc.execute(sql);

        // Verify seeded doctors exist
        Integer doctorCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM doctors WHERE id IN ('d0c70000-0000-4000-8000-000000000001', 'd0c70000-0000-4000-8000-000000000002')",
                Integer.class);
        assertThat(doctorCount).isEqualTo(2);

        // Verify seeded patients exist
        Integer patientCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM patients WHERE id IN ('ba710000-0000-4000-8000-000000000001', 'ba710000-0000-4000-8000-000000000002')",
                Integer.class);
        assertThat(patientCount).isEqualTo(2);

        // Verify Eleanor Vance has Penicillin allergy
        String[] allergies = jdbc.queryForObject(
                "SELECT allergies FROM patients WHERE id = 'ba710000-0000-4000-8000-000000000002'",
                (rs, rowNum) -> (String[]) rs.getArray("allergies").getArray());
        assertThat(allergies).contains("Penicillin");

        // Verify appointments across statuses (COMPLETED, CHECKED_IN, BOOKED)
        Integer apptCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM appointments WHERE id IN ('a9970000-0000-4000-8000-000000000001', 'a9970000-0000-4000-8000-000000000002', 'a9970000-0000-4000-8000-000000000003', 'a9970000-0000-4000-8000-000000000004')",
                Integer.class);
        assertThat(apptCount).isEqualTo(4);

        // Verify invoice and payment exist
        Integer invoiceCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM invoices WHERE invoice_number = 'INV-DEMO-00001' AND status = 'PAID'",
                Integer.class);
        assertThat(invoiceCount).isEqualTo(1);

        // Execute a second time to verify complete idempotency
        jdbc.execute(sql);

        // Counts must remain identical
        Integer doctorCountSecond = jdbc.queryForObject(
                "SELECT COUNT(*) FROM doctors WHERE id IN ('d0c70000-0000-4000-8000-000000000001', 'd0c70000-0000-4000-8000-000000000002')",
                Integer.class);
        assertThat(doctorCountSecond).isEqualTo(2);
    }
}
