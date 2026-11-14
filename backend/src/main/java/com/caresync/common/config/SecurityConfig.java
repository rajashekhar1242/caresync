package com.caresync.common.config;

import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.ErrorResponseWriter;
import com.caresync.common.security.JwtAuthenticationFilter;
import com.caresync.common.security.SecurityEventLogger;
import com.caresync.common.security.SecurityUtils;
import com.caresync.common.security.UserPrincipal;
import com.caresync.common.util.RequestIpUtils;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

/**
 * Stateless JWT security configuration, method security, CORS, and uniform 401/403 responses.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@EnableConfigurationProperties(CareSyncProperties.class)
public class SecurityConfig {

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10);
    }

    @Bean
    public FilterRegistrationBean<JwtAuthenticationFilter> jwtFilterRegistration(
            JwtAuthenticationFilter filter) {
        FilterRegistrationBean<JwtAuthenticationFilter> registration = new FilterRegistrationBean<>(filter);
        registration.setEnabled(false);
        return registration;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            JwtAuthenticationFilter jwtAuthenticationFilter,
            CorsConfigurationSource corsConfigurationSource,
            ErrorResponseWriter errorResponseWriter,
            SecurityEventLogger securityEventLogger) throws Exception {
        return http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(headers -> headers
                        .frameOptions(HeadersConfigurer.FrameOptionsConfig::deny)
                        .contentTypeOptions(Customizer.withDefaults()))
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((request, response, authException) -> {
                            Object attr = request.getAttribute(JwtAuthenticationFilter.AUTH_ERROR_CODE_ATTR);
                            ErrorCode code = attr instanceof ErrorCode c ? c : ErrorCode.UNAUTHORIZED;
                            String message = code == ErrorCode.TOKEN_EXPIRED
                                    ? "Access token has expired"
                                    : "Authentication is required";
                            securityEventLogger.unauthorizedAccess(
                                    request.getMethod(),
                                    request.getRequestURI(),
                                    code.name(),
                                    RequestIpUtils.extractClientIp(request));
                            errorResponseWriter.write(request, response, HttpStatus.UNAUTHORIZED, code, message);
                        })
                        .accessDeniedHandler((request, response, accessDeniedException) -> {
                            UserPrincipal principal = SecurityUtils.getCurrentPrincipal().orElse(null);
                            securityEventLogger.accessDenied(
                                    principal,
                                    request.getMethod(),
                                    request.getRequestURI(),
                                    RequestIpUtils.extractClientIp(request));
                            errorResponseWriter.write(
                                    request,
                                    response,
                                    HttpStatus.FORBIDDEN,
                                    ErrorCode.ACCESS_DENIED,
                                    "You do not have permission to perform this action");
                        }))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers(
                                HttpMethod.POST,
                                "/api/auth/register",
                                "/api/auth/login",
                                "/api/auth/refresh",
                                "/api/auth/logout")
                        .permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/queue/board").permitAll()
                        .requestMatchers("/ws/**").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/actuator/**").hasRole("ADMIN")
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }
}
