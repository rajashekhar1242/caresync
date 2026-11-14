package com.caresync.auth.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.dto.AuthResponse;
import com.caresync.auth.dto.TokenResponse;
import com.caresync.auth.dto.UserResponse;
import com.caresync.auth.entity.Role;
import com.caresync.auth.service.AuthService;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.exception.UnauthorizedException;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.testsupport.SecuritySliceTestConfig;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AuthController.class)
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private AuthService authService;

    @BeforeEach
    void resetLimits() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void registerReturns201AndValidationErrors400AndDuplicate409() throws Exception {
        UUID userId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();
        when(authService.register(any(), any())).thenReturn(new AuthResponse(
                "jwt-access",
                "raw-refresh",
                "Bearer",
                900,
                new UserResponse(userId, "pat@example.com", "Pat Doe", Role.PATIENT, patientId, null)));

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Pat Doe","email":"pat@example.com","password":"Password123!","phone":"+919876543210"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accessToken").value("jwt-access"))
                .andExpect(jsonPath("$.user.role").value("PATIENT"))
                .andExpect(jsonPath("$.user.patientId").value(patientId.toString()));

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"A","email":"not-an-email","password":"short"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fieldErrors").isNotEmpty());

        when(authService.register(any(), any()))
                .thenThrow(new ConflictException(ErrorCode.EMAIL_ALREADY_EXISTS, "Duplicate email"));
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fullName":"Pat Doe","email":"pat@example.com","password":"Password123!"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("EMAIL_ALREADY_EXISTS"));
    }

    @Test
    void loginRefreshAndLogoutContracts() throws Exception {
        when(authService.login(any(), any()))
                .thenThrow(new UnauthorizedException(ErrorCode.INVALID_CREDENTIALS, "Invalid credentials"));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"user@example.com","password":"wrong"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

        when(authService.refresh(any(), any()))
                .thenReturn(new TokenResponse("new-access", "new-refresh", "Bearer", 900));
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"old-refresh"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").value("new-access"));

        doNothing().when(authService).logout(any(), any());
        mockMvc.perform(post("/api/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"refreshToken":"old-refresh"}
                                """))
                .andExpect(status().isNoContent());
    }

    @Test
    void meEnforcesJwtAuthentication() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));

        UUID userId = UUID.randomUUID();
        UserPrincipal principal = new UserPrincipal(userId, "admin@caresync.local", "Admin", Role.ADMIN, null, null);
        String jwt = jwtService.generateAccessToken(principal);
        when(authService.getCurrentUser(eq(principal))).thenReturn(
                new UserResponse(userId, "admin@caresync.local", "Admin", Role.ADMIN, null, null));
        when(authService.getCurrentUser(any(UserPrincipal.class))).thenReturn(
                new UserResponse(userId, "admin@caresync.local", "Admin", Role.ADMIN, null, null));

        mockMvc.perform(get("/api/auth/me")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + jwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(userId.toString()))
                .andExpect(jsonPath("$.role").value("ADMIN"));
    }
}
