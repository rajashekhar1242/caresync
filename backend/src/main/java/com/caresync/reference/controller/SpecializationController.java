package com.caresync.reference.controller;

import com.caresync.reference.dto.SpecializationResponse;
import com.caresync.reference.service.ReferenceDataService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/specializations")
public class SpecializationController {

    private final ReferenceDataService referenceDataService;

    public SpecializationController(ReferenceDataService referenceDataService) {
        this.referenceDataService = referenceDataService;
    }

    @GetMapping
    public List<SpecializationResponse> listSpecializations() {
        return referenceDataService.listSpecializations();
    }
}
