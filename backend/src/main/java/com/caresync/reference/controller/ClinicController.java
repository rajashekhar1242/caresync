package com.caresync.reference.controller;

import com.caresync.reference.dto.ClinicResponse;
import com.caresync.reference.service.ReferenceDataService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/clinics")
public class ClinicController {

    private final ReferenceDataService referenceDataService;

    public ClinicController(ReferenceDataService referenceDataService) {
        this.referenceDataService = referenceDataService;
    }

    @GetMapping
    public List<ClinicResponse> listClinics() {
        return referenceDataService.listClinics();
    }
}
