package com.caresync.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.caresync.auth.dto.RegisterRequest;
import com.caresync.auth.entity.Role;
import com.caresync.auth.service.AuthService;
import com.caresync.common.config.CareSyncProperties;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.config.RequestLoggingFilter;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.testsupport.BaseIntegrationTest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

class AuthSecurityIT extends BaseIntegrationTest {

    @Autowired
    private WebApplicationContext context;

    @Autowired
    private JsonMapper jsonMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @Autowired
    private RequestLoggingFilter requestLoggingFilter;

    @Autowired
    private CareSyncProperties properties;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private AuthService authService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(requestLoggingFilter, rateLimitFilter)
                .apply(springSecurity())
                .build();
        rateLimitFilter.clearBuckets();
    }

    @Test
    void fullAuthLifecycleAndRoleBasedAccessAgainstPostgres() throws Exception {
        String email = "it-patient-" + System.nanoTime() + "@example.com";

        MvcResult regResult = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Integration Patient","email":"%s","password":"StrongPassword!123","phone":"+919811112222"}
                                """.formatted(email)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.role").value("PATIENT"))
                .andExpect(jsonPath("$.user.patientId").isNotEmpty())
                .andReturn();

        JsonNode regJson = jsonMapper.readTree(regResult.getResponse().getContentAsString());
        String accessToken = regJson.get("accessToken").asString();
        String refreshToken = regJson.get("refreshToken").asString();

        Integer linkedPatients = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM patients WHERE email = ?", Integer.class, email);
        assertThat(linkedPatients).isEqualTo(1);

        mockMvc.perform(get("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(email));

        // Patient is forbidden from admin-only actuator endpoint
        mockMvc.perform(get("/actuator/metrics")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        // Rotate refresh token
        MvcResult refreshResult = mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(refreshToken)))
                .andExpect(status().isOk())
                .andReturn();

        String newRefreshToken = jsonMapper.readTree(refreshResult.getResponse().getContentAsString())
                .get("refreshToken").asString();
        assertThat(newRefreshToken).isNotEqualTo(refreshToken);

        // Reuse of rotated token fails with 401 INVALID_REFRESH_TOKEN AND revokes active descendant tokens
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(refreshToken)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));

        // Compromised/rotated replacement token is also revoked persistently despite outer transaction rollback
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(newRefreshToken)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));

        Integer activeTokensAfterReplay = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE lower(u.email) = ? AND rt.revoked_at IS NULL",
                Integer.class, email);
        assertThat(activeTokensAfterReplay).isZero();

        // Logout revokes current refresh token idempotently
        mockMvc.perform(post("/api/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(newRefreshToken)))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(newRefreshToken)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));

        // Bootstrapped admin account can log in and access /actuator/metrics
        MvcResult adminLogin = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"admin-test@caresync.local","password":"TestAdmin!Password123"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("ADMIN"))
                .andReturn();

        String adminJwt = jsonMapper.readTree(adminLogin.getResponse().getContentAsString())
                .get("accessToken").asString();

        mockMvc.perform(get("/actuator/metrics")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt))
                .andExpect(status().isOk());
    }

    @Test
    void enforcesFilterChainRateLimitExpiredJwtLockedSentinelAndSingleAccessDeniedLog() throws Exception {
        // 1. Seeded locked sentinel accounts cannot be authenticated with the sentinel string
        mockMvc.perform(post("/api/auth/login")
                        .with(req -> {
                            req.setRemoteAddr("10.20.0.1");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"admin@caresync.local","password":"!LOCKED_REQUIRES_BOOTSTRAP!"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

        // 2. Expired JWT yields 401 TOKEN_EXPIRED
        Clock pastClock = Clock.fixed(Instant.now().minusSeconds(3600), ZoneOffset.UTC);
        JwtService pastJwtService = new JwtService(properties, pastClock);
        String expiredJwt = pastJwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "expired@caresync.local", "Expired User", Role.PATIENT, UUID.randomUUID(), null));

        mockMvc.perform(get("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + expiredJwt))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("TOKEN_EXPIRED"));

        // 3. Filter-level 403 ACCESS_DENIED logs a single security event without duplicates
        Logger securityLogger = (Logger) LoggerFactory.getLogger("SECURITY_EVENTS");
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        securityLogger.addAppender(appender);
        try {
            String patientJwt = jwtService.generateAccessToken(new UserPrincipal(
                    UUID.randomUUID(), "patient-it@caresync.local", "IT Patient", Role.PATIENT, UUID.randomUUID(), null));

            mockMvc.perform(get("/actuator/metrics")
                            .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

            long accessDeniedCount = appender.list.stream()
                    .map(ILoggingEvent::getFormattedMessage)
                    .filter(msg -> msg.contains("event=ACCESS_DENIED"))
                    .count();
            assertThat(accessDeniedCount).isEqualTo(1);
        } finally {
            securityLogger.detachAppender(appender);
        }

        // 4. RateLimitFilter executes in filter chain: enforces 429 + Retry-After while excluding logout
        long loginLimit = properties.rateLimit().loginPerMinute();
        for (int i = 0; i < loginLimit; i++) {
            mockMvc.perform(post("/api/auth/login")
                            .with(req -> {
                                req.setRemoteAddr("10.20.0.99");
                                return req;
                            })
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("""
                                    {"email":"missing@caresync.local","password":"WrongPassword!123"}
                                    """))
                    .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(post("/api/auth/login")
                        .with(req -> {
                            req.setRemoteAddr("10.20.0.99");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"missing@caresync.local","password":"WrongPassword!123"}
                                """))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER))
                .andExpect(jsonPath("$.code").value("TOO_MANY_REQUESTS"));

        mockMvc.perform(post("/api/auth/logout")
                        .with(req -> {
                            req.setRemoteAddr("10.20.0.99");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"not-a-valid-token"}
                                """))
                .andExpect(status().isNoContent());
    }

    @Test
    void concurrentRegistrationWithSameEmailDifferentCasingReturnsCreatedAndConflict() throws Exception {
        String unique = UUID.randomUUID().toString().substring(0, 8);
        String mixedEmail = "Race.User." + unique + "@Example.COM";
        String lowerEmail = mixedEmail.toLowerCase();

        List<Integer> statuses = Collections.synchronizedList(new ArrayList<>());
        List<String> bodies = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch gate = new CountDownLatch(1);
        try {
            Future<?> first = pool.submit(() -> {
                gate.await();
                MvcResult res = mockMvc.perform(post("/api/auth/register")
                                .with(req -> {
                                    req.setRemoteAddr("10.20.0.51");
                                    return req;
                                })
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"fullName":"Race User One","email":"%s","password":"StrongPassword!123"}
                                        """.formatted(mixedEmail)))
                        .andReturn();
                statuses.add(res.getResponse().getStatus());
                bodies.add(res.getResponse().getContentAsString());
                return null;
            });
            Future<?> second = pool.submit(() -> {
                gate.await();
                MvcResult res = mockMvc.perform(post("/api/auth/register")
                                .with(req -> {
                                    req.setRemoteAddr("10.20.0.52");
                                    return req;
                                })
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("""
                                        {"fullName":"Race User Two","email":"%s","password":"StrongPassword!123"}
                                        """.formatted(lowerEmail)))
                        .andReturn();
                statuses.add(res.getResponse().getStatus());
                bodies.add(res.getResponse().getContentAsString());
                return null;
            });
            gate.countDown();
            first.get();
            second.get();
        } finally {
            pool.shutdownNow();
        }

        assertThat(statuses).containsExactlyInAnyOrder(201, 409);
        int conflictIdx = statuses.indexOf(409);
        String conflictBody = bodies.get(conflictIdx);
        assertThat(jsonMapper.readTree(conflictBody).get("code").asString()).isEqualTo("EMAIL_ALREADY_EXISTS");
        assertThat(conflictBody).doesNotContain("uq_users_email_lower", "duplicate key", "SQL");

        Integer userCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users WHERE lower(email) = ?", Integer.class, lowerEmail);
        Integer patientCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM patients WHERE lower(email) = ?", Integer.class, lowerEmail);
        assertThat(userCount).isEqualTo(1);
        assertThat(patientCount).isEqualTo(1);
    }

    @Test
    void nonEmailDataIntegrityViolationDuringRegistrationIsNotMaskedAsEmailConflict() {
        String email = "non-email-constraint-" + UUID.randomUUID() + "@example.com";
        RegisterRequest oversizedFullNameRequest = new RegisterRequest(
                "A".repeat(120),
                email,
                "StrongPassword!123",
                null);

        assertThatThrownBy(() -> authService.register(oversizedFullNameRequest, "127.0.0.1"))
                .isInstanceOf(DataIntegrityViolationException.class);

        Integer userCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM users WHERE lower(email) = ?", Integer.class, email);
        Integer patientCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM patients WHERE lower(email) = ?", Integer.class, email);
        assertThat(userCount).isZero();
        assertThat(patientCount).isZero();
    }

    @Test
    void concurrentRefreshRaceRevokesUserRefreshTokensAndLeavesZeroActiveTokens() throws Exception {
        String email = "concurrent-refresh-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
        MvcResult regResult = mockMvc.perform(post("/api/auth/register")
                        .with(req -> {
                            req.setRemoteAddr("10.20.0.61");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Concurrent Refresh","email":"%s","password":"StrongPassword!123"}
                                """.formatted(email)))
                .andExpect(status().isCreated())
                .andReturn();
        String refreshToken = jsonMapper.readTree(regResult.getResponse().getContentAsString())
                .get("refreshToken").asString();

        int concurrency = 25;
        List<Integer> statuses = Collections.synchronizedList(new ArrayList<>());
        List<MvcResult> results = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(concurrency);
        CountDownLatch gate = new CountDownLatch(1);
        try {
            for (int i = 0; i < concurrency; i++) {
                final String ip = "10.20.5." + (i + 1);
                pool.submit(() -> {
                    gate.await();
                    MvcResult res = mockMvc.perform(post("/api/auth/refresh")
                                    .with(req -> {
                                        req.setRemoteAddr(ip);
                                        return req;
                                    })
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content("""
                                            {"refreshToken":"%s"}
                                            """.formatted(refreshToken)))
                            .andReturn();
                    statuses.add(res.getResponse().getStatus());
                    results.add(res);
                    return null;
                });
            }
            gate.countDown();
            pool.shutdown();
            assertThat(pool.awaitTermination(20, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
        } finally {
            pool.shutdownNow();
        }

        assertThat(statuses).hasSize(concurrency);
        assertThat(statuses.stream().filter(s -> s == 200).count()).isEqualTo(1);
        assertThat(statuses.stream().filter(s -> s == 401).count()).isEqualTo(concurrency - 1);
        Integer activeTokens = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE lower(u.email) = ? AND rt.revoked_at IS NULL",
                Integer.class, email);
        assertThat(activeTokens).isZero();

        // Verify that the rotated replacement token issued to the winner was also revoked by replay detection
        MvcResult winnerResult = results.stream().filter(r -> r.getResponse().getStatus() == 200).findFirst().orElseThrow();
        String rotatedToken = jsonMapper.readTree(winnerResult.getResponse().getContentAsString()).get("refreshToken").asString();
        mockMvc.perform(post("/api/auth/refresh")
                        .with(req -> {
                            req.setRemoteAddr("10.20.5.99");
                            return req;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"%s"}
                                """.formatted(rotatedToken)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_REFRESH_TOKEN"));
    }
}
