package com.caresync.prescription.controller;

import com.caresync.common.dto.PageResponse;
import com.caresync.common.security.SecurityUtils;
import com.caresync.prescription.dto.PrescriptionCheckRequest;
import com.caresync.prescription.dto.PrescriptionCheckResponse;
import com.caresync.prescription.dto.PrescriptionCreateRequest;
import com.caresync.prescription.dto.PrescriptionResponse;
import com.caresync.prescription.service.PrescriptionService;
import com.caresync.prescription.service.SafetyCheckService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Validated
public class PrescriptionController {

    private final SafetyCheckService safetyCheckService;
    private final PrescriptionService prescriptionService;

    public PrescriptionController(
            SafetyCheckService safetyCheckService,
            PrescriptionService prescriptionService) {
        this.safetyCheckService = safetyCheckService;
        this.prescriptionService = prescriptionService;
    }

    @PostMapping("/prescriptions/check")
    public PrescriptionCheckResponse checkPrescription(@Valid @RequestBody PrescriptionCheckRequest request) {
        return safetyCheckService.checkPrescription(SecurityUtils.requireCurrentPrincipal(), request);
    }

    @PostMapping("/prescriptions")
    @ResponseStatus(HttpStatus.CREATED)
    public PrescriptionResponse createPrescription(@Valid @RequestBody PrescriptionCreateRequest request) {
        return prescriptionService.createPrescription(SecurityUtils.requireCurrentPrincipal(), request);
    }

    @GetMapping("/prescriptions/{prescriptionId}")
    public PrescriptionResponse getPrescription(@PathVariable UUID prescriptionId) {
        return prescriptionService.getPrescription(SecurityUtils.requireCurrentPrincipal(), prescriptionId);
    }

    @GetMapping("/prescriptions/{prescriptionId}/pdf")
    public ResponseEntity<byte[]> getPrescriptionPdf(@PathVariable UUID prescriptionId) {
        byte[] pdfBytes = prescriptionService.getPrescriptionPdf(
                SecurityUtils.requireCurrentPrincipal(),
                prescriptionId);
        String shortId = prescriptionId.toString().substring(0, 8);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .cacheControl(CacheControl.noStore())
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename("prescription-" + shortId + ".pdf").build().toString())
                .body(pdfBytes);
    }

    @GetMapping("/patients/{patientId}/prescriptions")
    public PageResponse<PrescriptionResponse> listPatientPrescriptions(
            @PathVariable UUID patientId,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return prescriptionService.listPatientPrescriptions(
                SecurityUtils.requireCurrentPrincipal(),
                patientId,
                page,
                size);
    }
}
