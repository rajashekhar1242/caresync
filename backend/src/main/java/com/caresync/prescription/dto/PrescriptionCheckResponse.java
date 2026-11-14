package com.caresync.prescription.dto;

import java.util.List;

public record PrescriptionCheckResponse(List<PrescriptionWarningDto> warnings) {
}
