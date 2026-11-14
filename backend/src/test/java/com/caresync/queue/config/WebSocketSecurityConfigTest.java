package com.caresync.queue.config;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.caresync.auth.entity.Role;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;

class WebSocketSecurityConfigTest {

    private JwtService jwtService;
    private WebSocketSecurityConfig interceptor;
    private final MessageChannel dummyChannel = (message, timeout) -> true;

    private final UUID doctorAId = UUID.randomUUID();
    private final UUID doctorBId = UUID.randomUUID();

    private final UserPrincipal doctorAPrincipal = new UserPrincipal(
            UUID.randomUUID(), "doctorA@caresync.local", "Dr. A", Role.DOCTOR, null, doctorAId);
    private final UserPrincipal doctorBPrincipal = new UserPrincipal(
            UUID.randomUUID(), "doctorB@caresync.local", "Dr. B", Role.DOCTOR, null, doctorBId);
    private final UserPrincipal receptionistPrincipal = new UserPrincipal(
            UUID.randomUUID(), "recept@caresync.local", "Receptionist", Role.RECEPTIONIST, null, null);
    private final UserPrincipal adminPrincipal = new UserPrincipal(
            UUID.randomUUID(), "admin@caresync.local", "Admin", Role.ADMIN, null, null);
    private final UserPrincipal patientPrincipal = new UserPrincipal(
            UUID.randomUUID(), "patient@caresync.local", "Patient", Role.PATIENT, UUID.randomUUID(), null);

    @BeforeEach
    void setUp() {
        jwtService = mock(JwtService.class);
        interceptor = new WebSocketSecurityConfig(jwtService);

        when(jwtService.parseAccessToken("token-doc-a")).thenReturn(doctorAPrincipal);
        when(jwtService.parseAccessToken("token-doc-b")).thenReturn(doctorBPrincipal);
        when(jwtService.parseAccessToken("token-recept")).thenReturn(receptionistPrincipal);
        when(jwtService.parseAccessToken("token-admin")).thenReturn(adminPrincipal);
        when(jwtService.parseAccessToken("token-patient")).thenReturn(patientPrincipal);
    }

    @Test
    void rejectsAllSendFrames() {
        Message<byte[]> sendMsg = stompFrame(StompCommand.SEND, "/app/queue/test", null, null);
        assertThatThrownBy(() -> interceptor.preSend(sendMsg, dummyChannel))
                .isInstanceOf(MessageDeliveryException.class)
                .hasMessageContaining("Client SEND frames are rejected");
    }

    @Test
    void rejectsMalformedDestinations() {
        Map<String, Object> sessionAttrs = new HashMap<>();
        sessionAttrs.put(WebSocketSecurityConfig.USER_PRINCIPAL_SESSION_ATTR, doctorAPrincipal);

        for (String badDest : new String[]{"/topic/queue/*", "/topic/queue/", "/topic/queue/a/b", "/topic/other", "/app/chat", null}) {
            Message<byte[]> subMsg = stompFrame(StompCommand.SUBSCRIBE, badDest, null, sessionAttrs);
            assertThatThrownBy(() -> interceptor.preSend(subMsg, dummyChannel))
                    .as("Expected rejection for destination: %s", badDest)
                    .isInstanceOf(MessageDeliveryException.class);
        }
    }

    @Test
    void permitsDoctorSubscribingToOwnQueue() {
        Map<String, Object> sessionAttrs = new HashMap<>();
        sessionAttrs.put(WebSocketSecurityConfig.USER_PRINCIPAL_SESSION_ATTR, doctorAPrincipal);

        Message<byte[]> validSub = stompFrame(
                StompCommand.SUBSCRIBE,
                "/topic/queue/" + doctorAId,
                null,
                sessionAttrs);

        assertThatCode(() -> interceptor.preSend(validSub, dummyChannel)).doesNotThrowAnyException();
    }

    @Test
    void rejectsDoctorSubscribingToAnotherDoctorsQueue() {
        Map<String, Object> sessionAttrs = new HashMap<>();
        sessionAttrs.put(WebSocketSecurityConfig.USER_PRINCIPAL_SESSION_ATTR, doctorAPrincipal);

        // Doctor A tries to subscribe to Doctor B's queue
        Message<byte[]> snoopSub = stompFrame(
                StompCommand.SUBSCRIBE,
                "/topic/queue/" + doctorBId,
                null,
                sessionAttrs);

        assertThatThrownBy(() -> interceptor.preSend(snoopSub, dummyChannel))
                .isInstanceOf(MessageDeliveryException.class)
                .hasMessageContaining("Doctors can only subscribe to their own queue");
    }

    @Test
    void permitsReceptionistAndAdminSubscribingToAnyDoctorQueue() {
        Map<String, Object> receptSession = new HashMap<>();
        receptSession.put(WebSocketSecurityConfig.USER_PRINCIPAL_SESSION_ATTR, receptionistPrincipal);

        Message<byte[]> receptSub = stompFrame(
                StompCommand.SUBSCRIBE,
                "/topic/queue/" + doctorAId,
                null,
                receptSession);
        assertThatCode(() -> interceptor.preSend(receptSub, dummyChannel)).doesNotThrowAnyException();

        Map<String, Object> adminSession = new HashMap<>();
        adminSession.put(WebSocketSecurityConfig.USER_PRINCIPAL_SESSION_ATTR, adminPrincipal);

        Message<byte[]> adminSub = stompFrame(
                StompCommand.SUBSCRIBE,
                "/topic/queue/" + doctorBId,
                null,
                adminSession);
        assertThatCode(() -> interceptor.preSend(adminSub, dummyChannel)).doesNotThrowAnyException();
    }

    @Test
    void rejectsPatientSubscribingToDoctorQueue() {
        Map<String, Object> patientSession = new HashMap<>();
        patientSession.put(WebSocketSecurityConfig.USER_PRINCIPAL_SESSION_ATTR, patientPrincipal);

        Message<byte[]> patientSub = stompFrame(
                StompCommand.SUBSCRIBE,
                "/topic/queue/" + doctorAId,
                null,
                patientSession);

        assertThatThrownBy(() -> interceptor.preSend(patientSub, dummyChannel))
                .isInstanceOf(MessageDeliveryException.class)
                .hasMessageContaining("PATIENT role cannot subscribe to doctor queues");
    }

    @Test
    void rejectsUnauthenticatedSubscribe() {
        Message<byte[]> unauthSub = stompFrame(
                StompCommand.SUBSCRIBE,
                "/topic/queue/" + doctorAId,
                null,
                new HashMap<>());

        assertThatThrownBy(() -> interceptor.preSend(unauthSub, dummyChannel))
                .isInstanceOf(MessageDeliveryException.class)
                .hasMessageContaining("Authentication required to subscribe to queue");
    }

    @Test
    void parsesBearerTokenOnConnectAndSetsSessionPrincipal() {
        Map<String, Object> sessionAttrs = new HashMap<>();
        Message<byte[]> connectMsg = stompFrame(
                StompCommand.CONNECT,
                null,
                "Bearer token-doc-a",
                sessionAttrs);

        assertThatCode(() -> interceptor.preSend(connectMsg, dummyChannel)).doesNotThrowAnyException();
        assertThatCode(() -> {
            UserPrincipal principal = (UserPrincipal) sessionAttrs.get(WebSocketSecurityConfig.USER_PRINCIPAL_SESSION_ATTR);
            if (principal == null || !doctorAId.equals(principal.getDoctorId())) {
                throw new AssertionError("Session principal was not set correctly");
            }
        }).doesNotThrowAnyException();
    }

    private Message<byte[]> stompFrame(
            StompCommand command,
            String destination,
            String authHeader,
            Map<String, Object> sessionAttributes) {
        StompHeaderAccessor accessor = StompHeaderAccessor.create(command);
        if (destination != null) {
            accessor.setDestination(destination);
        }
        if (authHeader != null) {
            accessor.setNativeHeader("Authorization", authHeader);
        }
        if (sessionAttributes != null) {
            accessor.setSessionAttributes(sessionAttributes);
        }
        return MessageBuilder.createMessage(new byte[0], accessor.getMessageHeaders());
    }
}
