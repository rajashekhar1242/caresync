package com.caresync.reference.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.exception.ConflictException;
import com.caresync.common.exception.ErrorCode;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.reference.dto.ClinicResponse;
import com.caresync.reference.dto.DepartmentResponse;
import com.caresync.reference.dto.SpecializationResponse;
import com.caresync.reference.service.ReferenceDataService;
import com.caresync.testsupport.SecuritySliceTestConfig;
import java.util.List;
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

@WebMvcTest({DepartmentController.class, SpecializationController.class, ClinicController.class})
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class ReferenceDataControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private ReferenceDataService referenceDataService;

    @BeforeEach
    void resetLimits() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void listsClinicsSpecializationsAndDepartmentsForAuthenticatedUsers() throws Exception {
        mockMvc.perform(get("/api/departments")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/specializations")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/clinics")).andExpect(status().isUnauthorized());

        String patientJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "pat@caresync.local", "Pat", Role.PATIENT, UUID.randomUUID(), null));

        when(referenceDataService.listDepartments())
                .thenReturn(List.of(new DepartmentResponse(UUID.randomUUID(), "Cardiology", "Heart care")));
        when(referenceDataService.listSpecializations())
                .thenReturn(List.of(new SpecializationResponse(UUID.randomUUID(), "Cardiology")));
        when(referenceDataService.listClinics())
                .thenReturn(List.of(new ClinicResponse(UUID.randomUUID(), "CareSync Main", "Hyd", "Asia/Kolkata")));

        mockMvc.perform(get("/api/departments").header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Cardiology"));

        mockMvc.perform(get("/api/specializations").header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Cardiology"));

        mockMvc.perform(get("/api/clinics").header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].timeZone").value("Asia/Kolkata"));
    }

    @Test
    void restrictsDepartmentWritesToAdminAndPropagatesConflictAndValidation() throws Exception {
        String receptionistJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "rec@caresync.local", "Rec", Role.RECEPTIONIST, null, null));
        String adminJwt = jwtService.generateAccessToken(new UserPrincipal(
                UUID.randomUUID(), "admin@caresync.local", "Admin", Role.ADMIN, null, null));

        mockMvc.perform(post("/api/departments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Cardiology","description":"Heart care"}
                                """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));

        UUID deptId = UUID.randomUUID();
        when(referenceDataService.createDepartment(any()))
                .thenReturn(new DepartmentResponse(deptId, "Cardiology", "Heart care"));

        mockMvc.perform(post("/api/departments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Cardiology","description":"Heart care"}
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(deptId.toString()))
                .andExpect(jsonPath("$.name").value("Cardiology"));

        when(referenceDataService.updateDepartment(any(), any()))
                .thenThrow(new ConflictException(ErrorCode.DEPARTMENT_NAME_EXISTS, "Duplicate"));

        mockMvc.perform(put("/api/departments/{id}", deptId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Pediatrics","description":"Children"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("DEPARTMENT_NAME_EXISTS"));

        mockMvc.perform(post("/api/departments")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + adminJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"A"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }
}
