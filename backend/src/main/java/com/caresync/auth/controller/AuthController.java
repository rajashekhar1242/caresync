package com.caresync.auth.controller;

import com.caresync.auth.dto.AuthResponse;
import com.caresync.auth.dto.LoginRequest;
import com.caresync.auth.dto.RefreshRequest;
import com.caresync.auth.dto.RegisterRequest;
import com.caresync.auth.dto.TokenResponse;
import com.caresync.auth.dto.UserResponse;
import com.caresync.auth.service.AuthService;
import com.caresync.common.security.SecurityUtils;
import com.caresync.common.security.UserPrincipal;
import com.caresync.common.util.RequestIpUtils;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for authentication, registration, refresh token rotation, logout, and current user inspection.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse register(
            @Valid @RequestBody RegisterRequest request,
            HttpServletRequest httpRequest) {
        return authService.register(request, RequestIpUtils.extractClientIp(httpRequest));
    }

    @PostMapping("/login")
    public AuthResponse login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest) {
        return authService.login(request, RequestIpUtils.extractClientIp(httpRequest));
    }

    @PostMapping("/refresh")
    public TokenResponse refresh(
            @Valid @RequestBody RefreshRequest request,
            HttpServletRequest httpRequest) {
        return authService.refresh(request, RequestIpUtils.extractClientIp(httpRequest));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(
            @Valid @RequestBody RefreshRequest request,
            HttpServletRequest httpRequest) {
        authService.logout(request, RequestIpUtils.extractClientIp(httpRequest));
    }

    @GetMapping("/me")
    public UserResponse me() {
        UserPrincipal principal = SecurityUtils.requireCurrentPrincipal();
        return authService.getCurrentUser(principal);
    }
}
