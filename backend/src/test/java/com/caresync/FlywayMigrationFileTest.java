package com.caresync;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

class FlywayMigrationFileTest {

    @Test
    void migrationsExistInSequentialOrderWithoutPredictableHashes() throws IOException {
        var resolver = new PathMatchingResourcePatternResolver();
        Resource[] resources = resolver.getResources("classpath:db/migration/V*__*.sql");
        assertThat(resources).hasSize(12);

        List<String> filenames = new ArrayList<>();
        for (Resource resource : resources) {
            filenames.add(resource.getFilename());
        }
        for (int v = 1; v <= 12; v++) {
            String prefix = "V" + v + "__";
            assertThat(filenames.stream().anyMatch(name -> name != null && name.startsWith(prefix)))
                    .as("Migration starting with %s", prefix)
                    .isTrue();
        }

        Resource v9 = resolver.getResource("classpath:db/migration/V9__create_indexes_and_constraints.sql");
        String v9Sql = new String(v9.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertThat(v9Sql).contains("uq_appointment_slot_active");
        assertThat(v9Sql).contains("uq_appointment_doctor_in_consultation");
        assertThat(v9Sql).contains("uq_payment_method_txn_ref");

        Resource v11 = resolver.getResource("classpath:db/migration/V11__seed_staff_accounts.sql");
        String v11Sql = new String(v11.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertThat(v11Sql).contains("!LOCKED_REQUIRES_BOOTSTRAP!");
        assertThat(v11Sql).doesNotContain("$2a$");
        assertThat(v11Sql).doesNotContain("$2b$");

        Resource v12 = resolver.getResource("classpath:db/migration/V12__protect_audit_logs_append_only.sql");
        String v12Sql = new String(v12.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertThat(v12Sql).contains("trg_audit_logs_append_only");
        assertThat(v12Sql).contains("BEFORE UPDATE OR DELETE ON audit_logs");
    }
}
