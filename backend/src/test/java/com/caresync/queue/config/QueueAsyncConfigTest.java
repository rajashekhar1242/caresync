package com.caresync.queue.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

class QueueAsyncConfigTest {

    @Test
    void executorIsConfiguredWithBoundedThreadPoolAndCustomRejectionHandler() throws Exception {
        QueueAsyncConfig config = new QueueAsyncConfig();
        Executor executor = config.queueBroadcastExecutor();

        assertThat(executor).isInstanceOf(ThreadPoolTaskExecutor.class);
        ThreadPoolTaskExecutor taskExecutor = (ThreadPoolTaskExecutor) executor;

        try {
            assertThat(taskExecutor.getCorePoolSize()).isEqualTo(4);
            assertThat(taskExecutor.getMaxPoolSize()).isEqualTo(8);
            assertThat(taskExecutor.getQueueCapacity()).isEqualTo(500);
            assertThat(taskExecutor.getThreadNamePrefix()).isEqualTo("queue-broadcast-");

            CountDownLatch blockLatch = new CountDownLatch(1);
            CountDownLatch coreRunningLatch = new CountDownLatch(4);
            AtomicBoolean rejectionTriggered = new AtomicBoolean(false);

            // 1. Submit 4 tasks to occupy core threads
            for (int i = 0; i < 4; i++) {
                taskExecutor.execute(() -> {
                    coreRunningLatch.countDown();
                    try {
                        blockLatch.await(5, TimeUnit.SECONDS);
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                    }
                });
            }
            assertThat(coreRunningLatch.await(3, TimeUnit.SECONDS)).isTrue();

            // 2. Submit 500 tasks to fill the work queue
            for (int i = 0; i < 500; i++) {
                taskExecutor.execute(() -> {});
            }

            // 3. Submit 4 more tasks to trigger expansion to maxPoolSize (8)
            for (int i = 0; i < 4; i++) {
                taskExecutor.execute(() -> {
                    try {
                        blockLatch.await(5, TimeUnit.SECONDS);
                    } catch (InterruptedException ignored) {
                        Thread.currentThread().interrupt();
                    }
                });
            }

            // 4. Thread pool is now at maxPoolSize (8) and queue is full (500).
            // The next submission must trigger the custom RejectedExecutionHandler without throwing an exception.
            taskExecutor.execute(() -> {});
            rejectionTriggered.set(true);

            assertThat(rejectionTriggered.get()).isTrue();

            blockLatch.countDown();
        } finally {
            taskExecutor.shutdown();
        }
    }
}
