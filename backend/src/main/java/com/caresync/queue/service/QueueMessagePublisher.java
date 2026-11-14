package com.caresync.queue.service;

import com.caresync.appointment.event.QueueChangedDomainEvent;
import com.caresync.queue.config.QueueAsyncConfig;
import com.caresync.queue.dto.QueueUpdateMessage;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Broadcasts token-only queue snapshots asynchronously over STOMP after the database transaction commits.
 * Asynchronous execution on a bounded thread pool prevents nested connection pool acquisition
 * while the calling transaction's connection is held.
 */
@Component
public class QueueMessagePublisher {

    private static final Logger log = LoggerFactory.getLogger(QueueMessagePublisher.class);

    private final QueueService queueService;
    private final SimpMessagingTemplate messagingTemplate;
    private final Executor queueBroadcastExecutor;

    public QueueMessagePublisher(
            QueueService queueService,
            SimpMessagingTemplate messagingTemplate,
            @Qualifier(QueueAsyncConfig.QUEUE_BROADCAST_EXECUTOR) Executor queueBroadcastExecutor) {
        this.queueService = queueService;
        this.messagingTemplate = messagingTemplate;
        this.queueBroadcastExecutor = queueBroadcastExecutor;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onQueueChanged(QueueChangedDomainEvent event) {
        Map<String, String> mdcContext = MDC.getCopyOfContextMap();
        try {
            queueBroadcastExecutor.execute(() -> {
                if (mdcContext != null) {
                    MDC.setContextMap(mdcContext);
                }
                try {
                    QueueUpdateMessage message = queueService.buildQueueUpdateMessage(event);
                    messagingTemplate.convertAndSend("/topic/queue/" + event.doctorId(), message);
                } catch (RuntimeException ex) {
                    log.warn(
                            "queue_broadcast_failed doctorId={} clinicId={} eventType={} errorType={}",
                            event.doctorId(),
                            event.clinicId(),
                            event.eventType(),
                            ex.getClass().getSimpleName());
                } finally {
                    MDC.clear();
                }
            });
        } catch (RejectedExecutionException ex) {
            log.warn(
                    "queue_broadcast_rejected doctorId={} clinicId={} eventType={}",
                    event.doctorId(),
                    event.clinicId(),
                    event.eventType());
        }
    }
}
