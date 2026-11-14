package com.caresync.medicine.controller;

import com.caresync.common.dto.PageResponse;
import com.caresync.medicine.dto.MedicineResponse;
import com.caresync.medicine.service.MedicineService;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/medicines")
@Validated
public class MedicineController {

    private final MedicineService medicineService;

    public MedicineController(MedicineService medicineService) {
        this.medicineService = medicineService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'DOCTOR')")
    public PageResponse<MedicineResponse> searchMedicines(
            @RequestParam(required = false) @Size(min = 2, max = 100) String name,
            @RequestParam(defaultValue = "0") @Min(0) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return medicineService.searchMedicines(name, page, size);
    }
}
