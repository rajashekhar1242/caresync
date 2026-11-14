package com.caresync.common.security;

import com.caresync.common.exception.UnauthorizedException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.MDC;
import org.springframework.http.HttpHeaders;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Validates Bearer JWT access tokens on incoming requests without touching the database.
 */
@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    public static final String AUTH_ERROR_CODE_ATTR = "CARESYNC_AUTH_ERROR_CODE";
    public static final String AUTH_ERROR_MSG_ATTR = "CARESYNC_AUTH_ERROR_MSG";
    private static final String BEARER_PREFIX = "Bearer ";
    private static final String USER_ID_MDC_KEY = "userId";

    private final JwtService jwtService;

    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        boolean addedMdcUserId = false;

        if (header != null && header.startsWith(BEARER_PREFIX)) {
            String token = header.substring(BEARER_PREFIX.length()).trim();
            try {
                UserPrincipal principal = jwtService.parseAccessToken(token);
                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
                authentication.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(authentication);
                MDC.put(USER_ID_MDC_KEY, principal.getUserId().toString());
                addedMdcUserId = true;
            } catch (UnauthorizedException ex) {
                SecurityContextHolder.clearContext();
                request.setAttribute(AUTH_ERROR_CODE_ATTR, ex.getErrorCode());
                request.setAttribute(AUTH_ERROR_MSG_ATTR, ex.getMessage());
            }
        }

        try {
            filterChain.doFilter(request, response);
        } finally {
            // Preserve userId for RequestLoggingFilter completion log when active; clear otherwise.
            if (addedMdcUserId && MDC.get("requestId") == null) {
                MDC.remove(USER_ID_MDC_KEY);
            }
        }
    }
}
