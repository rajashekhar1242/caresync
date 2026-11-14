package com.caresync.testsupport;

import com.caresync.common.config.ClockConfig;
import com.caresync.common.config.CorsConfig;
import com.caresync.common.config.SecurityConfig;
import com.caresync.common.exception.ErrorResponseWriter;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.SecurityEventLogger;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;

/**
 * Shared test configuration importing security and error-handling infrastructure for {@code @WebMvcTest} slices.
 */
@TestConfiguration
@Import({
    ClockConfig.class,
    CorsConfig.class,
    SecurityConfig.class,
    ErrorResponseWriter.class,
    SecurityEventLogger.class,
    JwtService.class
})
public class SecuritySliceTestConfig {
}
