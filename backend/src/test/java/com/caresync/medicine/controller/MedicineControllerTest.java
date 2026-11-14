package com.caresync.medicine.controller;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.medicine.dto.MedicineResponse;
import com.caresync.medicine.entity.MedicineForm;
import com.caresync.medicine.service.MedicineService;
import com.caresync.testsupport.SecuritySliceTestConfig;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(MedicineController.class)
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class MedicineControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private MedicineService medicineService;

    @BeforeEach
    void resetLimits() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void enforcesRoleMatrixAndQueryValidation() throws Exception {
        mockMvc.perform(get("/api/medicines"))
                .andExpect(status().isUnauthorized());

        String receptionistJwt = jwtService.generateAccessToken(
                new UserPrincipal(UUID.randomUUID(), "rec@clinic.test", "Rec", Role.RECEPTIONIST, null, null));
        mockMvc.perform(get("/api/medicines")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + receptionistJwt))
                .andExpect(status().isForbidden());

        String patientJwt = jwtService.generateAccessToken(
                new UserPrincipal(UUID.randomUUID(), "pat@clinic.test", "Pat", Role.PATIENT, UUID.randomUUID(), null));
        mockMvc.perform(get("/api/medicines")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + patientJwt))
                .andExpect(status().isForbidden());

        String docJwt = jwtService.generateAccessToken(
                new UserPrincipal(UUID.randomUUID(), "doc@clinic.test", "Doc", Role.DOCTOR, null, UUID.randomUUID()));

        mockMvc.perform(get("/api/medicines").param("name", "a")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt))
                .andExpect(status().isBadRequest());

        MedicineResponse item = new MedicineResponse(
                UUID.randomUUID(), "Augmentin 625", "Amoxicillin + Clavulanic acid",
                "500 mg + 125 mg", MedicineForm.TABLET, "Penicillin");
        when(medicineService.searchMedicines("pen", 0, 20))
                .thenReturn(new PageResponse<>(List.of(item), 0, 20, 1, 1));

        mockMvc.perform(get("/api/medicines").param("name", "pen")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].name").value("Augmentin 625"));
    }
}
