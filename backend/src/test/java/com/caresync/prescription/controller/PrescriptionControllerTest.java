package com.caresync.prescription.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.caresync.auth.entity.Role;
import com.caresync.common.config.RateLimitFilter;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.security.JwtService;
import com.caresync.common.security.UserPrincipal;
import com.caresync.medicine.dto.MedicineResponse;
import com.caresync.medicine.entity.MedicineForm;
import com.caresync.prescription.dto.PrescriptionCheckResponse;
import com.caresync.prescription.dto.PrescriptionItemResponse;
import com.caresync.prescription.dto.PrescriptionResponse;
import com.caresync.prescription.service.PrescriptionService;
import com.caresync.prescription.service.SafetyCheckService;
import com.caresync.testsupport.SecuritySliceTestConfig;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
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

@WebMvcTest(PrescriptionController.class)
@ActiveProfiles("test")
@Import(SecuritySliceTestConfig.class)
class PrescriptionControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private RateLimitFilter rateLimitFilter;

    @MockitoBean
    private SafetyCheckService safetyCheckService;

    @MockitoBean
    private PrescriptionService prescriptionService;

    @BeforeEach
    void resetLimits() {
        rateLimitFilter.clearBuckets();
    }

    @Test
    void enforcesAuthValidationPdfHeadersAndRoutes() throws Exception {
        UUID rxId = UUID.fromString("7c9e6679-7425-40de-944b-e07fc1f90ae7");
        UUID consultationId = UUID.randomUUID();
        UUID appointmentId = UUID.randomUUID();
        UUID patientId = UUID.randomUUID();
        UUID doctorId = UUID.randomUUID();
        UUID medId = UUID.randomUUID();

        mockMvc.perform(get("/api/prescriptions/{id}", rxId))
                .andExpect(status().isUnauthorized());

        String docJwt = jwtService.generateAccessToken(
                new UserPrincipal(UUID.randomUUID(), "doc@clinic.test", "Dr. Rao", Role.DOCTOR, null, doctorId));

        mockMvc.perform(post("/api/prescriptions/check")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"patientId":"%s","medicineIds":[]}
                                """.formatted(patientId)))
                .andExpect(status().isBadRequest());

        when(safetyCheckService.checkPrescription(any(), any()))
                .thenReturn(new PrescriptionCheckResponse(List.of()));

        mockMvc.perform(post("/api/prescriptions/check")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"patientId":"%s","medicineIds":["%s"]}
                                """.formatted(patientId, medId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.warnings").isArray());

        PrescriptionResponse rx = new PrescriptionResponse(
                rxId, consultationId, appointmentId, patientId, "Priya", doctorId, "Dr. Rao",
                List.of(new PrescriptionItemResponse(
                        new MedicineResponse(medId, "Dolo 650", "Paracetamol", "650 mg", MedicineForm.TABLET, "Analgesic"),
                        "650 mg", "1-0-1", 5, "After food")),
                List.of(), false, Instant.now());

        when(prescriptionService.createPrescription(any(), any())).thenReturn(rx);
        when(prescriptionService.getPrescription(any(), eq(rxId))).thenReturn(rx);
        when(prescriptionService.getPrescriptionPdf(any(), eq(rxId)))
                .thenReturn("%PDF-1.4 mock".getBytes(StandardCharsets.US_ASCII));
        when(prescriptionService.listPatientPrescriptions(any(), eq(patientId), eq(0), eq(20)))
                .thenReturn(new PageResponse<>(List.of(rx), 0, 20, 1, 1));

        mockMvc.perform(post("/api/prescriptions")
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "consultationId":"%s",
                                  "items":[{"medicineId":"%s","dosage":"650 mg","frequency":"1-0-1","durationDays":5}]
                                }
                                """.formatted(consultationId, medId)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(rxId.toString()));

        mockMvc.perform(get("/api/prescriptions/{id}", rxId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/prescriptions/{id}/pdf", rxId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt)
                        .accept(MediaType.APPLICATION_PDF, MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"prescription-7c9e6679.pdf\""));

        mockMvc.perform(get("/api/patients/{id}/prescriptions", patientId)
                        .header(HttpHeaders.AUTHORIZATION, "Bearer " + docJwt))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(rxId.toString()));
    }
}
