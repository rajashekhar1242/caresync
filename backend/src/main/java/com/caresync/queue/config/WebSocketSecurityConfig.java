package com.caresync.queue.config;

import com.caresync.auth.entity.Role;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import java.security.Principal;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

/**
 * Enforces authenticated STOMP rules:
 * 1. Rejects all client SEND frames (read-only queue broadcast).
 * 2. Authenticates JWT Bearer token on CONNECT or SUBSCRIBE.
 * 3. Enforces RBAC on SUBSCRIBE /topic/queue/{doctorId}:
 *    - ADMIN / RECEPTIONIST: allowed to monitor doctor queues.
 *    - DOCTOR: allowed ONLY to monitor their own queue.
 *    - PATIENT / Unauthenticated: rejected fail-closed.
 */
@Component
public class WebSocketSecurityConfig implements ChannelInterceptor {

    private static final Pattern ALLOWED_SUBSCRIBE_DESTINATION =
            Pattern.compile("^/topic/queue/([A-Za-z0-9-]+)$");
    public static final String USER_PRINCIPAL_SESSION_ATTR = "STOMP_USER_PRINCIPAL";

    private final JwtService jwtService;

    public WebSocketSecurityConfig(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
        if (accessor == null || accessor.getCommand() == null) {
            return message;
        }

        StompCommand command = accessor.getCommand();

        if (command == StompCommand.SEND) {
            throw new MessageDeliveryException(message, "Client SEND frames are rejected on /ws");
        }

        if (command == StompCommand.CONNECT) {
            handleConnect(accessor, message);
        }

        if (command == StompCommand.SUBSCRIBE) {
            handleSubscribe(accessor, message);
        }

        return message;
    }

    private void handleConnect(StompHeaderAccessor accessor, Message<?> message) {
        String authHeader = extractAuthHeader(accessor);
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            throw new MessageDeliveryException(message, "Missing or invalid Authorization header on WebSocket CONNECT");
        }
        String token = authHeader.substring(7).trim();
        try {
            UserPrincipal principal = jwtService.parseAccessToken(token);
            Map<String, Object> sessionAttributes = accessor.getSessionAttributes();
            if (sessionAttributes != null) {
                sessionAttributes.put(USER_PRINCIPAL_SESSION_ATTR, principal);
            }
            if (accessor.isMutable()) {
                accessor.setUser(new StompPrincipal(principal.getEmail()));
            }
        } catch (Exception ex) {
            throw new MessageDeliveryException(message, "Invalid or expired JWT token on WebSocket CONNECT: " + ex.getMessage());
        }
    }

    private void handleSubscribe(StompHeaderAccessor accessor, Message<?> message) {
        String destination = accessor.getDestination();
        if (destination == null) {
            throw new MessageDeliveryException(message, "Subscription destination is required");
        }

        Matcher matcher = ALLOWED_SUBSCRIBE_DESTINATION.matcher(destination);
        if (!matcher.matches()) {
            throw new MessageDeliveryException(message, "Subscription destination is not permitted");
        }

        // Retrieve authenticated principal from session attributes or check header
        UserPrincipal principal = null;
        Map<String, Object> sessionAttributes = accessor.getSessionAttributes();
        if (sessionAttributes != null) {
            Object attr = sessionAttributes.get(USER_PRINCIPAL_SESSION_ATTR);
            if (attr instanceof UserPrincipal up) {
                principal = up;
            }
        }

        if (principal == null) {
            String authHeader = extractAuthHeader(accessor);
            if (authHeader != null && authHeader.startsWith("Bearer ")) {
                try {
                    principal = jwtService.parseAccessToken(authHeader.substring(7).trim());
                    if (sessionAttributes != null) {
                        sessionAttributes.put(USER_PRINCIPAL_SESSION_ATTR, principal);
                    }
                } catch (Exception ignored) {
                    // fall through to unauthenticated rejection
                }
            }
        }

        if (principal == null) {
            throw new MessageDeliveryException(message, "Authentication required to subscribe to queue");
        }

        String targetDoctorIdStr = matcher.group(1);
        UUID targetDoctorId;
        try {
            targetDoctorId = UUID.fromString(targetDoctorIdStr);
        } catch (IllegalArgumentException ex) {
            throw new MessageDeliveryException(message, "Invalid doctor ID in subscription destination");
        }

        Role role = principal.getRole();
        if (role == Role.ADMIN || role == Role.RECEPTIONIST) {
            // Receptionist and Admin are authorized to monitor queues for operational desk
            return;
        }

        if (role == Role.DOCTOR) {
            if (targetDoctorId.equals(principal.getDoctorId())) {
                // Doctor is authorized to monitor their own queue
                return;
            }
            throw new MessageDeliveryException(
                    message,
                    "Access denied: Doctors can only subscribe to their own queue");
        }

        throw new MessageDeliveryException(
                message,
                "Access denied: " + role + " role cannot subscribe to doctor queues");
    }

    private String extractAuthHeader(StompHeaderAccessor accessor) {
        String authHeader = accessor.getFirstNativeHeader("Authorization");
        if (authHeader == null || authHeader.isBlank()) {
            authHeader = accessor.getFirstNativeHeader("authorization");
        }
        return authHeader;
    }

    public record StompPrincipal(String name) implements Principal {
        @Override
        public String getName() {
            return name;
        }
    }
}
