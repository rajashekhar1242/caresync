package com.caresync.common.security;

import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.UnauthorizedException;
import java.util.Optional;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Helper methods to access the current authenticated {@link UserPrincipal}.
 */
public final class SecurityUtils {

    private SecurityUtils() {
    }

    public static Optional<UserPrincipal> getCurrentPrincipal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            return Optional.empty();
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof UserPrincipal userPrincipal) {
            return Optional.of(userPrincipal);
        }
        return Optional.empty();
    }

    public static UserPrincipal requireCurrentPrincipal() {
        return getCurrentPrincipal()
                .orElseThrow(() -> new UnauthorizedException(ErrorCode.UNAUTHORIZED, "Authentication is required"));
    }
}
