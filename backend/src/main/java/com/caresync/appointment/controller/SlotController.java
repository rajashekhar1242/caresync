package com.caresync.appointment.controller;

import com.caresync.appointment.dto.SlotListResponse;
import com.caresync.appointment.service.SlotService;
import com.caresync.common.security.SecurityUtils;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/doctors/{doctorId}/slots")
public class SlotController {

    private final SlotService slotService;

    public SlotController(SlotService slotService) {
        this.slotService = slotService;
    }

    @GetMapping
    public SlotListResponse listDoctorSlots(
            @PathVariable UUID doctorId,
            @RequestParam LocalDate date) {
        return slotService.listDoctorSlots(SecurityUtils.requireCurrentPrincipal(), doctorId, date);
    }
}
