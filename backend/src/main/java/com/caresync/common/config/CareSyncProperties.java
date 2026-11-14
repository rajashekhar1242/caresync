package com.caresync.common.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "caresync")
public record CareSyncProperties(
        Jwt jwt,
        Cors cors,
        RateLimit rateLimit,
        Reporting reporting,
        Bootstrap bootstrap
) {
    public record Jwt(
            String secret,
            long accessTokenExpirySeconds,
            long refreshTokenExpirySeconds
    ) {
    }

    public record Cors(
            List<String> allowedOrigins
    ) {
    }

    public record RateLimit(
            long registerPerMinute,
            long loginPerMinute,
            long refreshPerMinute,
            long boardPerMinute
    ) {
    }

    public record Reporting(
            String timeZone
    ) {
    }

    public record Bootstrap(
            StaffSeed admin,
            StaffSeed receptionist,
            DemoSeed demo
    ) {
        public record StaffSeed(
                String email,
                String password
        ) {
        }

        public record DemoSeed(
                String doctorPassword,
                String patientPassword
        ) {
        }
    }
}
