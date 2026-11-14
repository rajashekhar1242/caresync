package com.caresync.consultation.controller;

import com.caresync.common.security.SecurityUtils;
import com.caresync.consultation.dto.ConsultationRequest;
import com.caresync.consultation.dto.ConsultationResponse;
import com.caresync.consultation.service.ConsultationService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class ConsultationController {

    private final ConsultationService consultationService;

    public ConsultationController(ConsultationService consultationService) {
        this.consultationService = consultationService;
    }

    @GetMapping("/appointments/{appointmentId}/consultation")
    public ConsultationResponse getAppointmentConsultation(@PathVariable UUID appointmentId) {
        return consultationService.getAppointmentConsultation(
                SecurityUtils.requireCurrentPrincipal(),
                appointmentId);
    }

    @PostMapping("/appointments/{appointmentId}/consultation")
    @ResponseStatus(HttpStatus.CREATED)
    public ConsultationResponse createConsultation(
            @PathVariable UUID appointmentId,
            @Valid @RequestBody ConsultationRequest request) {
        return consultationService.createConsultation(
                SecurityUtils.requireCurrentPrincipal(),
                appointmentId,
                request);
    }

    @GetMapping("/consultations/{consultationId}")
    public ConsultationResponse getConsultation(@PathVariable UUID consultationId) {
        return consultationService.getConsultation(
                SecurityUtils.requireCurrentPrincipal(),
                consultationId);
    }

    @PutMapping("/consultations/{consultationId}")
    public ConsultationResponse updateConsultation(
            @PathVariable UUID consultationId,
            @Valid @RequestBody ConsultationRequest request) {
        return consultationService.updateConsultation(
                SecurityUtils.requireCurrentPrincipal(),
                consultationId,
                request);
    }
}
