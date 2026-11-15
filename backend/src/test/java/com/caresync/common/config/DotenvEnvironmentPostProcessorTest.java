package com.caresync.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

class DotenvEnvironmentPostProcessorTest {

    @Test
    void parsesDotenvLinesWithCommentsQuotesAndExports(@TempDir Path tempDir) throws IOException {
        Path envFile = tempDir.resolve(".env");
        String content = """
                # CareSync Test Environment File
                CARESYNC_JWT_SECRET=super-secret-key-at-least-32-bytes-long!
                CARESYNC_ADMIN_EMAIL="admin@caresync.local"
                CARESYNC_RECEPTIONIST_EMAIL='reception@caresync.local'
                export SPRING_PROFILES_ACTIVE=dev
                EMPTY_LINE_FOLLOWS=true

                # Another comment
                WITH_EQUALS=jdbc:postgresql://localhost:5432/caresync?sslmode=require
                INVALID_LINE_NO_EQUALS
                """;
        Files.writeString(envFile, content);

        DotenvEnvironmentPostProcessor processor = new DotenvEnvironmentPostProcessor();
        Map<String, Object> target = new HashMap<>();
        processor.loadInto(envFile, target);

        assertThat(target).containsEntry("CARESYNC_JWT_SECRET", "super-secret-key-at-least-32-bytes-long!");
        assertThat(target).containsEntry("CARESYNC_ADMIN_EMAIL", "admin@caresync.local");
        assertThat(target).containsEntry("CARESYNC_RECEPTIONIST_EMAIL", "reception@caresync.local");
        assertThat(target).containsEntry("SPRING_PROFILES_ACTIVE", "dev");
        assertThat(target).containsEntry("EMPTY_LINE_FOLLOWS", "true");
        assertThat(target).containsEntry("WITH_EQUALS", "jdbc:postgresql://localhost:5432/caresync?sslmode=require");
        assertThat(target).doesNotContainKey("INVALID_LINE_NO_EQUALS");
    }

    @Test
    void postProcessEnvironmentAddsDotenvPropertiesAfterSystemEnvironment() {
        DotenvEnvironmentPostProcessor processor = new DotenvEnvironmentPostProcessor() {
            @Override
            Map<String, Object> loadAllDotenvFiles() {
                return Map.of("CARESYNC_JWT_SECRET", "mocked-secret-key-min-32-bytes!!");
            }
        };

        StandardEnvironment environment = new StandardEnvironment();
        processor.postProcessEnvironment(environment, null);

        assertThat(environment.getPropertySources().contains(DotenvEnvironmentPostProcessor.PROPERTY_SOURCE_NAME))
                .isTrue();
        assertThat(environment.getProperty("CARESYNC_JWT_SECRET"))
                .isEqualTo("mocked-secret-key-min-32-bytes!!");
    }

    @Test
    void systemEnvironmentTakesPrecedenceOverDotenv() {
        DotenvEnvironmentPostProcessor processor = new DotenvEnvironmentPostProcessor() {
            @Override
            Map<String, Object> loadAllDotenvFiles() {
                return Map.of("CARESYNC_JWT_SECRET", "dotenv-secret-val-32-bytes-min!");
            }
        };

        StandardEnvironment environment = new StandardEnvironment();
        // Simulate an OS environment variable already set
        Map<String, Object> sysEnv = new HashMap<>();
        sysEnv.put("CARESYNC_JWT_SECRET", "real-os-env-secret-val-32-bytes!");
        environment.getPropertySources().replace(
                StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME,
                new MapPropertySource(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME, sysEnv)
        );

        processor.postProcessEnvironment(environment, null);

        // System environment must take precedence over .env
        assertThat(environment.getProperty("CARESYNC_JWT_SECRET"))
                .isEqualTo("real-os-env-secret-val-32-bytes!");
    }
}
