package com.caresync.queue.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.caresync.appointment.event.QueueChangedDomainEvent;
import com.caresync.appointment.event.QueueEventType;
import com.caresync.queue.dto.QueueUpdateMessage;
import java.lang.reflect.Method;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

class QueueMessagePublisherTest {

    private QueueService queueService;
    private SimpMessagingTemplate messagingTemplate;
    private QueueMessagePublisher publisher;

    @BeforeEach
    void setUp() {
        queueService = mock(QueueService.class);
        messagingTemplate = mock(SimpMessagingTemplate.class);
        publisher = new QueueMessagePublisher(queueService, messagingTemplate, Runnable::run);
    }

    @Test
    void broadcastsQueueSnapshotOnCommittedDomainEvent() {
        UUID doctorId = UUID.randomUUID();
        UUID clinicId = UUID.randomUUID();
        QueueChangedDomainEvent event = new QueueChangedDomainEvent(
                doctorId, clinicId, LocalDate.of(2026, 6, 10), QueueEventType.PATIENT_CALLED);
        QueueUpdateMessage payload = new QueueUpdateMessage(
                QueueUpdateMessage.TYPE_QUEUE_UPDATED,
                QueueEventType.PATIENT_CALLED,
                doctorId,
                clinicId,
                LocalDate.of(2026, 6, 10),
                1,
                List.of(2, 3),
                2,
                3,
                Instant.parse("2026-06-10T04:00:00Z"));

        when(queueService.buildQueueUpdateMessage(event)).thenReturn(payload);

        publisher.onQueueChanged(event);

        verify(messagingTemplate).convertAndSend("/topic/queue/" + doctorId, payload);
    }

    @Test
    void isolatesSnapshotQueryExceptionWithoutPropagatingToCaller() {
        QueueChangedDomainEvent event = new QueueChangedDomainEvent(
                UUID.randomUUID(), UUID.randomUUID(), LocalDate.of(2026, 6, 10), QueueEventType.TOKEN_ISSUED);
        when(queueService.buildQueueUpdateMessage(event))
                .thenThrow(new IllegalStateException("Simulated post-commit query error"));

        assertThatCode(() -> publisher.onQueueChanged(event)).doesNotThrowAnyException();
        verifyNoInteractions(messagingTemplate);
    }

    @Test
    void isolatesBrokerSendExceptionWithoutPropagatingToCaller() {
        UUID doctorId = UUID.randomUUID();
        QueueChangedDomainEvent event = new QueueChangedDomainEvent(
                doctorId, UUID.randomUUID(), LocalDate.of(2026, 6, 10), QueueEventType.CONSULTATION_COMPLETED);
        QueueUpdateMessage payload = new QueueUpdateMessage(
                QueueUpdateMessage.TYPE_QUEUE_UPDATED,
                QueueEventType.CONSULTATION_COMPLETED,
                doctorId,
                event.clinicId(),
                event.clinicDate(),
                null,
                List.of(),
                0,
                1,
                Instant.parse("2026-06-10T04:00:00Z"));
        when(queueService.buildQueueUpdateMessage(event)).thenReturn(payload);
        doThrow(new MessageDeliveryException("Simulated STOMP failure"))
                .when(messagingTemplate).convertAndSend("/topic/queue/" + doctorId, payload);

        assertThatCode(() -> publisher.onQueueChanged(event)).doesNotThrowAnyException();
    }

    @Test
    void isolatesExecutorRejectionExceptionWithoutPropagatingToCaller() {
        QueueMessagePublisher rejectedPublisher = new QueueMessagePublisher(
                queueService,
                messagingTemplate,
                task -> {
                    throw new java.util.concurrent.RejectedExecutionException("Simulated pool saturation");
                });
        QueueChangedDomainEvent event = new QueueChangedDomainEvent(
                UUID.randomUUID(), UUID.randomUUID(), LocalDate.of(2026, 6, 10), QueueEventType.TOKEN_ISSUED);

        assertThatCode(() -> rejectedPublisher.onQueueChanged(event)).doesNotThrowAnyException();
        verifyNoInteractions(queueService);
        verifyNoInteractions(messagingTemplate);
    }

    @Test
    void buildQueueUpdateMessageUsesReadOnlyTransactionWithoutRequiresNew() throws NoSuchMethodException {
        Method method = QueueService.class.getMethod("buildQueueUpdateMessage", QueueChangedDomainEvent.class);
        Transactional tx = method.getAnnotation(Transactional.class);

        assertThat(tx).isNotNull();
        assertThat(tx.propagation()).isEqualTo(Propagation.REQUIRED);
        assertThat(tx.readOnly()).isTrue();
    }
}
