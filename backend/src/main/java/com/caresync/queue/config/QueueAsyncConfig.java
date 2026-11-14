package com.caresync.queue.config;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * Provides a dedicated, bounded task executor for post-commit queue STOMP broadcasts.
 * Offloads queue message construction and fanout outside the calling HTTP transaction,
 * preventing connection pool self-deadlocks.
 */
@Configuration
public class QueueAsyncConfig {

    private static final Logger log = LoggerFactory.getLogger(QueueAsyncConfig.class);

    public static final String QUEUE_BROADCAST_EXECUTOR = "queueBroadcastExecutor";

    @Bean(name = QUEUE_BROADCAST_EXECUTOR)
    public Executor queueBroadcastExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(4);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(500);
        executor.setThreadNamePrefix("queue-broadcast-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(10);
        executor.setRejectedExecutionHandler((runnable, exec) -> log.warn(
                "queue_broadcast_rejected executor queue capacity exceeded (activeCount={}, queueSize={})",
                exec.getActiveCount(),
                exec.getQueue().size()));
        executor.initialize();
        return executor;
    }
}
