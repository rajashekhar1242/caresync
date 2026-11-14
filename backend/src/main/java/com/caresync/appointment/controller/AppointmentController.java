package com.caresync.appointment.controller;

import com.caresync.appointment.dto.AppointmentCreateRequest;
import com.caresync.appointment.dto.AppointmentResponse;
import com.caresync.appointment.dto.AppointmentStatusUpdateRequest;
import com.caresync.appointment.entity.AppointmentStatus;
import com.caresync.appointment.service.AppointmentService;
import com.caresync.appointment.service.StatusTransitionService;
import com.caresync.common.dto.PageResponse;
import com.caresync.common.security.SecurityUtils;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/appointments")
@Validated
public class AppointmentController {

    private final AppointmentService appointmentService;
    private final StatusTransitionService statusTransitionService;

    public AppointmentController(
            AppointmentService appointmentService,
            StatusTransitionService statusTransitionService) {
        this.appointmentService = appointmentService;
        this.statusTransitionService = statusTransitionService;
    }

    @GetMapping
    public PageResponse<AppointmentResponse> listAppointments(
            @RequestParam(required = false) UUID doctorId,
            @RequestParam(required = false) UUID patientId,
            @RequestParam(required = false) List<AppointmentStatus> status,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size,
            @RequestParam(defaultValue = "slotStart,asc") String sort) {
        return appointmentService.listAppointments(
                SecurityUtils.requireCurrentPrincipal(),
                doctorId,
                patientId,
                status,
                from,
                to,
                page,
                size,
                sort);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RECEPTIONIST', 'PATIENT')")
    @ResponseStatus(HttpStatus.CREATED)
    public AppointmentResponse bookAppointment(@Valid @RequestBody AppointmentCreateRequest request) {
        return appointmentService.bookAppointment(SecurityUtils.requireCurrentPrincipal(), request);
    }

    @GetMapping("/{appointmentId}")
    public AppointmentResponse getAppointment(@PathVariable UUID appointmentId) {
        return appointmentService.getAppointment(SecurityUtils.requireCurrentPrincipal(), appointmentId);
    }

    @PatchMapping("/{appointmentId}/status")
    public AppointmentResponse updateStatus(
            @PathVariable UUID appointmentId,
            @Valid @RequestBody AppointmentStatusUpdateRequest request) {
        return statusTransitionService.updateStatus(
                SecurityUtils.requireCurrentPrincipal(), appointmentId, request);
    }
}
