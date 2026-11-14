package com.caresync.doctor.controller;

import com.caresync.common.security.SecurityUtils;
import com.caresync.doctor.dto.WeeklyScheduleRequest;
import com.caresync.doctor.dto.WeeklyScheduleResponse;
import com.caresync.doctor.service.ScheduleService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/doctors/{doctorId}/schedules")
public class ScheduleController {

    private final ScheduleService scheduleService;

    public ScheduleController(ScheduleService scheduleService) {
        this.scheduleService = scheduleService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RECEPTIONIST', 'DOCTOR')")
    public WeeklyScheduleResponse getDoctorSchedule(@PathVariable UUID doctorId) {
        return scheduleService.getSchedule(SecurityUtils.requireCurrentPrincipal(), doctorId);
    }

    @PutMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR')")
    public WeeklyScheduleResponse replaceDoctorSchedule(
            @PathVariable UUID doctorId,
            @Valid @RequestBody WeeklyScheduleRequest request) {
        return scheduleService.replaceSchedule(SecurityUtils.requireCurrentPrincipal(), doctorId, request);
    }
}
