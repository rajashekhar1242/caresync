package com.caresync.queue.config;

import com.caresync.common.config.CareSyncProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final CareSyncProperties properties;
    private final WebSocketSecurityConfig webSocketSecurityConfig;

    public WebSocketConfig(
            CareSyncProperties properties,
            WebSocketSecurityConfig webSocketSecurityConfig) {
        this.properties = properties;
        this.webSocketSecurityConfig = webSocketSecurityConfig;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        String[] origins = properties.cors() != null && properties.cors().allowedOrigins() != null
                ? properties.cors().allowedOrigins().stream()
                        .map(String::trim)
                        .filter(s -> !s.isBlank() && !s.equals("*"))
                        .toArray(String[]::new)
                : new String[0];
        registry.addEndpoint("/ws")
                .setAllowedOrigins(origins);
        registry.addEndpoint("/ws")
                .setAllowedOrigins(origins)
                .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(webSocketSecurityConfig);
    }
}
