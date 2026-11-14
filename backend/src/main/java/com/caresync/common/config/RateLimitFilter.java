package com.caresync.common.config;

import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ErrorResponseWriter;
import com.caresync.common.security.SecurityEventLogger;
import com.caresync.common.util.RequestIpUtils;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import io.github.bucket4j.ConsumptionProbe;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Per-IP rate limiter (Bucket4j) protecting public auth endpoints (excluding logout) and the queue board.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class RateLimitFilter extends OncePerRequestFilter {

    static final int DEFAULT_MAX_BUCKET_CACHE_SIZE = 10_000;
    static final long DEFAULT_IDLE_TTL_NANOS = Duration.ofMinutes(5).toNanos();

    private final CareSyncProperties properties;
    private final ErrorResponseWriter errorResponseWriter;
    private final SecurityEventLogger securityEventLogger;
    private final int maxBucketCacheSize;
    private final long idleTtlNanos;
    private final LongSupplier nanoTimeSource;
    private final ConcurrentHashMap<String, BucketEntry> buckets = new ConcurrentHashMap<>();
    private final ReentrantLock evictionLock = new ReentrantLock();

    @Autowired
    public RateLimitFilter(
            CareSyncProperties properties,
            ErrorResponseWriter errorResponseWriter,
            SecurityEventLogger securityEventLogger) {
        this(
                properties,
                errorResponseWriter,
                securityEventLogger,
                DEFAULT_MAX_BUCKET_CACHE_SIZE,
                DEFAULT_IDLE_TTL_NANOS,
                System::nanoTime);
    }

    RateLimitFilter(
            CareSyncProperties properties,
            ErrorResponseWriter errorResponseWriter,
            SecurityEventLogger securityEventLogger,
            int maxBucketCacheSize,
            long idleTtlNanos,
            LongSupplier nanoTimeSource) {
        this.properties = properties;
        this.errorResponseWriter = errorResponseWriter;
        this.securityEventLogger = securityEventLogger;
        this.maxBucketCacheSize = Math.max(1, maxBucketCacheSize);
        this.idleTtlNanos = Math.max(1L, idleTtlNanos);
        this.nanoTimeSource = nanoTimeSource;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        RateLimitRule rule = resolveRule(request.getMethod(), request.getRequestURI());
        if (rule == null) {
            filterChain.doFilter(request, response);
            return;
        }

        String clientIp = RequestIpUtils.extractClientIp(request);
        String bucketKey = rule.key() + "|" + clientIp;
        long now = nanoTimeSource.getAsLong();
        BucketEntry entry = buckets.computeIfAbsent(
                bucketKey, k -> new BucketEntry(createBucket(rule.requestsPerMinute()), now));
        entry.touch(now);
        if (buckets.size() > maxBucketCacheSize) {
            evictIfNeeded(now, bucketKey);
        }
        ConsumptionProbe probe = entry.bucket.tryConsumeAndReturnRemaining(1);
        if (probe.isConsumed()) {
            filterChain.doFilter(request, response);
            return;
        }

        long nanos = Math.max(1_000_000_000L, probe.getNanosToWaitForRefill());
        long retryAfterSeconds = (nanos + 999_999_999L) / 1_000_000_000L;
        response.setHeader(HttpHeaders.RETRY_AFTER, String.valueOf(retryAfterSeconds));
        securityEventLogger.rateLimitExceeded(request.getMethod(), request.getRequestURI(), clientIp);
        errorResponseWriter.write(
                request,
                response,
                HttpStatus.TOO_MANY_REQUESTS,
                ErrorCode.TOO_MANY_REQUESTS,
                "Rate limit exceeded. Please try again later.");
    }

    public void clearBuckets() {
        buckets.clear();
    }

    int getBucketCacheSize() {
        return buckets.size();
    }

    boolean containsBucketFor(String ruleKey, String clientIp) {
        return buckets.containsKey(ruleKey + "|" + clientIp);
    }

    private void evictIfNeeded(long now, String protectedKey) {
        evictionLock.lock();
        try {
            if (buckets.size() <= maxBucketCacheSize) {
                return;
            }
            buckets.entrySet().removeIf(entry ->
                    !entry.getKey().equals(protectedKey)
                            && (now - entry.getValue().lastAccessNanos) >= idleTtlNanos);
            if (buckets.size() <= maxBucketCacheSize) {
                return;
            }
            int excess = buckets.size() - maxBucketCacheSize;
            int targetToEvict = Math.min(buckets.size() - 1, Math.max(excess, Math.max(1, maxBucketCacheSize / 5)));
            List<EvictionCandidate> candidates = new ArrayList<>();
            for (Map.Entry<String, BucketEntry> entry : buckets.entrySet()) {
                if (!entry.getKey().equals(protectedKey)) {
                    BucketEntry value = entry.getValue();
                    candidates.add(new EvictionCandidate(entry.getKey(), value, value.lastAccessNanos));
                }
            }
            candidates.sort(Comparator.comparingLong(EvictionCandidate::lastAccessNanos));
            int limit = Math.min(targetToEvict, candidates.size());
            for (int i = 0; i < limit; i++) {
                EvictionCandidate victim = candidates.get(i);
                buckets.remove(victim.key(), victim.entry());
            }
        } finally {
            evictionLock.unlock();
        }
    }

    private record EvictionCandidate(String key, BucketEntry entry, long lastAccessNanos) {
    }

    private static final class BucketEntry {
        private final Bucket bucket;
        private volatile long lastAccessNanos;

        private BucketEntry(Bucket bucket, long lastAccessNanos) {
            this.bucket = bucket;
            this.lastAccessNanos = lastAccessNanos;
        }

        private void touch(long nowNanos) {
            this.lastAccessNanos = nowNanos;
        }
    }

    private Bucket createBucket(long requestsPerMinute) {
        long capacity = Math.max(1L, requestsPerMinute);
        Bandwidth limit = Bandwidth.builder()
                .capacity(capacity)
                .refillGreedy(capacity, Duration.ofMinutes(1))
                .build();
        return Bucket.builder().addLimit(limit).build();
    }

    private RateLimitRule resolveRule(String method, String path) {
        CareSyncProperties.RateLimit rateLimit = properties.rateLimit();
        if (rateLimit == null) {
            return null;
        }
        if (HttpMethod.POST.matches(method)) {
            if ("/api/auth/register".equals(path)) {
                return new RateLimitRule("register", rateLimit.registerPerMinute());
            }
            if ("/api/auth/login".equals(path)) {
                return new RateLimitRule("login", rateLimit.loginPerMinute());
            }
            if ("/api/auth/refresh".equals(path)) {
                return new RateLimitRule("refresh", rateLimit.refreshPerMinute());
            }
        } else if (HttpMethod.GET.matches(method) && "/api/queue/board".equals(path)) {
            return new RateLimitRule("board", rateLimit.boardPerMinute());
        }
        return null;
    }

    private record RateLimitRule(String key, long requestsPerMinute) {
    }
}
