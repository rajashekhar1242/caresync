package com.caresync.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.caresync.common.exception.ErrorResponseWriter;
import com.caresync.common.security.SecurityEventLogger;
import jakarta.servlet.FilterChain;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

class RateLimitFilterTest {

    private CareSyncProperties propertiesWithLoginLimit(long loginLimit) {
        return new CareSyncProperties(
                new CareSyncProperties.Jwt("dGVzdC1vbmx5LWp3dC1zZWNyZXQta2V5LWF0LWxlYXN0LTMyLWJ5dGVzLWZvci10ZXN0cw==", 900, 604800),
                new CareSyncProperties.Cors(List.of("http://localhost:3000")),
                new CareSyncProperties.RateLimit(2, loginLimit, 5, 10),
                new CareSyncProperties.Reporting("Asia/Kolkata"),
                null);
    }

    private ErrorResponseWriter createWriter() {
        return new ErrorResponseWriter(
                JsonMapper.builder().build(),
                Clock.fixed(Instant.parse("2026-11-11T10:00:00Z"), ZoneOffset.UTC));
    }

    private RateLimitFilter createFilter(long loginLimit) {
        return new RateLimitFilter(propertiesWithLoginLimit(loginLimit), createWriter(), new SecurityEventLogger());
    }

    @Test
    void enforcesPerIpRateLimitWithRetryAfterHeader() throws Exception {
        RateLimitFilter filter = createFilter(2);

        for (int i = 0; i < 2; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/auth/login");
            req.setRemoteAddr("10.0.0.5");
            MockHttpServletResponse res = new MockHttpServletResponse();
            filter.doFilter(req, res, new MockFilterChain());
            assertThat(res.getStatus()).isEqualTo(200);
        }

        MockHttpServletRequest blockedReq = new MockHttpServletRequest("POST", "/api/auth/login");
        blockedReq.setRemoteAddr("10.0.0.5");
        MockHttpServletResponse blockedRes = new MockHttpServletResponse();
        FilterChain chain = new MockFilterChain();
        filter.doFilter(blockedReq, blockedRes, chain);

        assertThat(blockedRes.getStatus()).isEqualTo(429);
        assertThat(blockedRes.getHeader(HttpHeaders.RETRY_AFTER)).isNotNull();
        assertThat(blockedRes.getContentAsString()).contains("TOO_MANY_REQUESTS");

        // Different client IP has its own bucket
        MockHttpServletRequest otherIpReq = new MockHttpServletRequest("POST", "/api/auth/login");
        otherIpReq.setRemoteAddr("10.0.0.6");
        MockHttpServletResponse otherIpRes = new MockHttpServletResponse();
        filter.doFilter(otherIpReq, otherIpRes, new MockFilterChain());
        assertThat(otherIpRes.getStatus()).isEqualTo(200);
    }

    @Test
    void neverRateLimitsLogoutEndpoint() throws Exception {
        RateLimitFilter filter = createFilter(1);
        for (int i = 0; i < 5; i++) {
            MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/auth/logout");
            req.setRemoteAddr("10.0.0.5");
            MockHttpServletResponse res = new MockHttpServletResponse();
            filter.doFilter(req, res, new MockFilterChain());
            assertThat(res.getStatus()).isEqualTo(200);
        }
    }

    @Test
    void evictsIdleAndLeastRecentlyUsedBucketsWhilePreservingActiveBucketsWithinCap() throws Exception {
        AtomicLong nowNanos = new AtomicLong(1_000_000_000L);
        RateLimitFilter filter = new RateLimitFilter(
                propertiesWithLoginLimit(1),
                createWriter(),
                new SecurityEventLogger(),
                3,
                Duration.ofMinutes(2).toNanos(),
                nowNanos::get);

        // Exhaust IP-1 at t=1s, then refresh IP-1 repeatedly so it remains recently active
        sendLogin(filter, "10.0.1.1", 200);
        sendLogin(filter, "10.0.1.2", 200);
        nowNanos.addAndGet(Duration.ofSeconds(10).toNanos());
        sendLogin(filter, "10.0.1.3", 200);
        nowNanos.addAndGet(Duration.ofSeconds(10).toNanos());
        sendLogin(filter, "10.0.1.1", 429); // keeps IP-1 active and newest

        // Inserting IP-4 exceeds capacity 3 -> evicts oldest (IP-2) while keeping active IP-1 & IP-3
        nowNanos.addAndGet(Duration.ofSeconds(10).toNanos());
        sendLogin(filter, "10.0.1.4", 200);

        assertThat(filter.getBucketCacheSize()).isLessThanOrEqualTo(3);
        assertThat(filter.containsBucketFor("login", "10.0.1.1")).isTrue();
        assertThat(filter.containsBucketFor("login", "10.0.1.2")).isFalse();
        assertThat(filter.containsBucketFor("login", "10.0.1.3")).isTrue();
        assertThat(filter.containsBucketFor("login", "10.0.1.4")).isTrue();

        // Active throttled IP-1 still gets 429 because its bucket was NOT cleared
        sendLogin(filter, "10.0.1.1", 429);

        // Advance past idle TTL and hit from IP-5 -> stale IP-3 and IP-4 are evicted first
        nowNanos.addAndGet(Duration.ofMinutes(3).toNanos());
        sendLogin(filter, "10.0.1.5", 200);

        assertThat(filter.getBucketCacheSize()).isEqualTo(1);
        assertThat(filter.containsBucketFor("login", "10.0.1.5")).isTrue();
    }

    @Test
    void enforcesBoundedCacheSafelyUnderConcurrentAccess() throws Exception {
        RateLimitFilter filter = new RateLimitFilter(
                propertiesWithLoginLimit(5),
                createWriter(),
                new SecurityEventLogger(),
                25,
                Duration.ofMinutes(5).toNanos(),
                System::nanoTime);

        int threads = 8;
        int requestsPerThread = 50;
        try (ExecutorService executor = Executors.newFixedThreadPool(threads)) {
            List<Callable<Void>> tasks = new ArrayList<>();
            for (int t = 0; t < threads; t++) {
                final int threadId = t;
                tasks.add(() -> {
                    for (int i = 0; i < requestsPerThread; i++) {
                        sendLogin(filter, "192.168." + threadId + "." + i, 200);
                    }
                    return null;
                });
            }
            List<Future<Void>> futures = executor.invokeAll(tasks);
            for (Future<Void> future : futures) {
                future.get();
            }
        }

        assertThat(filter.getBucketCacheSize()).isLessThanOrEqualTo(25);
    }

    @Test
    void concurrentHotTouchesDuringContinuousEvictionNeverFailWithSortContractError() throws Exception {
        RateLimitFilter filter = new RateLimitFilter(
                propertiesWithLoginLimit(10_000),
                createWriter(),
                new SecurityEventLogger(),
                20,
                Duration.ofMinutes(5).toNanos(),
                System::nanoTime);

        int threads = 12;
        int iterations = 150;
        try (ExecutorService executor = Executors.newFixedThreadPool(threads)) {
            List<Callable<Void>> tasks = new ArrayList<>();
            for (int t = 0; t < threads; t++) {
                final int threadId = t;
                tasks.add(() -> {
                    for (int i = 0; i < iterations; i++) {
                        // Alternate between shared hot keys (mutating lastAccessNanos concurrently) and cold keys
                        String ip = (i % 2 == 0)
                                ? "10.99.0." + (i % 5)
                                : "10." + threadId + "." + (i / 10) + "." + (i % 100);
                        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/auth/login");
                        req.setRemoteAddr(ip);
                        MockHttpServletResponse res = new MockHttpServletResponse();
                        filter.doFilter(req, res, new MockFilterChain());
                        assertThat(res.getStatus()).isEqualTo(200);
                    }
                    return null;
                });
            }
            List<Future<Void>> futures = executor.invokeAll(tasks);
            for (Future<Void> future : futures) {
                future.get();
            }
        }

        assertThat(filter.getBucketCacheSize()).isLessThanOrEqualTo(20);
    }

    private void sendLogin(RateLimitFilter filter, String ip, int expectedStatus) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest("POST", "/api/auth/login");
        req.setRemoteAddr(ip);
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, new MockFilterChain());
        assertThat(res.getStatus()).isEqualTo(expectedStatus);
    }
}
