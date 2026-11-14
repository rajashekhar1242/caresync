package com.caresync.doctor.controller;

import com.caresync.common.security.SecurityUtils;
import com.caresync.doctor.dto.LeaveRequest;
import com.caresync.doctor.dto.LeaveResponse;
import com.caresync.doctor.service.LeaveService;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/doctors/{doctorId}/leaves")
public class LeaveController {

    private final LeaveService leaveService;

    public LeaveController(LeaveService leaveService) {
        this.leaveService = leaveService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'RECEPTIONIST', 'DOCTOR')")
    public List<LeaveResponse> listDoctorLeaves(
            @PathVariable UUID doctorId,
            @RequestParam(required = false) LocalDate from,
            @RequestParam(required = false) LocalDate to) {
        return leaveService.listLeaves(SecurityUtils.requireCurrentPrincipal(), doctorId, from, to);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR')")
    @ResponseStatus(HttpStatus.CREATED)
    public LeaveResponse createDoctorLeave(
            @PathVariable UUID doctorId,
            @Valid @RequestBody LeaveRequest request) {
        return leaveService.createLeave(SecurityUtils.requireCurrentPrincipal(), doctorId, request);
    }

    @DeleteMapping("/{leaveId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR')")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteDoctorLeave(
            @PathVariable UUID doctorId,
            @PathVariable UUID leaveId) {
        leaveService.deleteLeave(SecurityUtils.requireCurrentPrincipal(), doctorId, leaveId);
    }
}
