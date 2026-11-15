package com.caresync.common.config;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.Ordered;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

/**
 * Automatically detects and loads local {@code .env} files into Spring's {@link ConfigurableEnvironment}
 * during local development, ensuring variables like {@code CARESYNC_JWT_SECRET} and
 * {@code SPRING_DATASOURCE_URL} are available without manual PowerShell/export steps.
 * <p>
 * Registered in {@code META-INF/spring/org.springframework.boot.EnvironmentPostProcessor.imports}.
 * The loaded properties have lower precedence than real system environment variables,
 * ensuring production settings (e.g. Render environment variables) are never overridden.
 */
public class DotenvEnvironmentPostProcessor implements EnvironmentPostProcessor, Ordered {

    public static final String PROPERTY_SOURCE_NAME = "dotenvProperties";

    @Override
    public int getOrder() {
        return Ordered.LOWEST_PRECEDENCE;
    }

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        Map<String, Object> dotenvProps = loadAllDotenvFiles();
        if (dotenvProps.isEmpty()) {
            return;
        }

        // Add dotenv properties right after system environment so OS environment variables take precedence
        if (environment.getPropertySources().contains(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME)) {
            environment.getPropertySources().addAfter(
                    StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME,
                    new MapPropertySource(PROPERTY_SOURCE_NAME, dotenvProps));
        } else {
            environment.getPropertySources().addLast(
                    new MapPropertySource(PROPERTY_SOURCE_NAME, dotenvProps));
        }
    }

    /**
     * Inspects candidate directories in order of precedence:
     * root .env first, then backend/.env (so backend-specific overrides take precedence).
     */
    Map<String, Object> loadAllDotenvFiles() {
        Map<String, Object> combined = new HashMap<>();

        String userDir = System.getProperty("user.dir", ".");
        List<Path> candidates = List.of(
                Paths.get("..", ".env"),
                Paths.get(".env"),
                Paths.get("backend", ".env"),
                Paths.get(userDir, ".env"),
                Paths.get(userDir, "backend", ".env")
        );

        for (Path candidate : candidates) {
            try {
                if (Files.isRegularFile(candidate)) {
                    loadInto(candidate.toAbsolutePath().normalize(), combined);
                }
            } catch (Exception ignored) {
                // If path resolution or access fails, continue to next candidate
            }
        }
        return combined;
    }

    void loadInto(Path path, Map<String, Object> target) {
        try (BufferedReader reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                // Support optional "export KEY=VALUE" format
                if (line.startsWith("export ") && line.length() > 7) {
                    line = line.substring(7).trim();
                }
                int eqIdx = line.indexOf('=');
                if (eqIdx == -1) {
                    continue;
                }
                String key = line.substring(0, eqIdx).trim();
                if (key.isEmpty()) {
                    continue;
                }
                String rawValue = line.substring(eqIdx + 1).trim();
                String value = cleanValue(rawValue);
                target.put(key, value);
            }
        } catch (IOException ignored) {
            // If file cannot be read, ignore and continue
        }
    }

    private String cleanValue(String val) {
        if ((val.startsWith("\"") && val.endsWith("\"") && val.length() >= 2)
                || (val.startsWith("'") && val.endsWith("'") && val.length() >= 2)) {
            val = val.substring(1, val.length() - 1);
        }
        return val;
    }
}
