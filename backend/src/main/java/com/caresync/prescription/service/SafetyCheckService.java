package com.caresync.prescription.service;

import com.caresync.auth.entity.Role;
import com.caresync.common.exception.ForbiddenException;
import com.caresync.common.exception.ResourceNotFoundException;
import com.caresync.common.exception.ValidationException;
import com.caresync.common.security.UserPrincipal;
import com.caresync.medicine.entity.DrugInteraction;
import com.caresync.medicine.entity.Medicine;
import com.caresync.medicine.entity.WarningSeverity;
import com.caresync.medicine.repository.DrugInteractionRepository;
import com.caresync.medicine.repository.MedicineRepository;
import com.caresync.patient.entity.Patient;
import com.caresync.patient.repository.PatientRepository;
import com.caresync.patient.service.PatientService;
import com.caresync.prescription.dto.MedicineRef;
import com.caresync.prescription.dto.PrescriptionCheckRequest;
import com.caresync.prescription.dto.PrescriptionCheckResponse;
import com.caresync.prescription.dto.PrescriptionWarningDto;
import com.caresync.prescription.entity.WarningType;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SafetyCheckService {

    private static final Comparator<PrescriptionWarningDto> WARNING_COMPARATOR = Comparator
            .comparingInt((PrescriptionWarningDto w) -> severityRank(w.severity()))
            .thenComparingInt(w -> typeRank(w.type()))
            .thenComparing(w -> w.medicines().getFirst().name(), String.CASE_INSENSITIVE_ORDER)
            .thenComparing(
                    w -> w.medicines().size() > 1 ? w.medicines().get(1).name() : "",
                    String.CASE_INSENSITIVE_ORDER);

    private final PatientRepository patientRepository;
    private final MedicineRepository medicineRepository;
    private final DrugInteractionRepository drugInteractionRepository;
    private final PatientService patientService;

    public SafetyCheckService(
            PatientRepository patientRepository,
            MedicineRepository medicineRepository,
            DrugInteractionRepository drugInteractionRepository,
            PatientService patientService) {
        this.patientRepository = patientRepository;
        this.medicineRepository = medicineRepository;
        this.drugInteractionRepository = drugInteractionRepository;
        this.patientService = patientService;
    }

    @Transactional(readOnly = true)
    public PrescriptionCheckResponse checkPrescription(UserPrincipal caller, PrescriptionCheckRequest request) {
        Set<UUID> uniqueIds = new HashSet<>(request.medicineIds());
        if (uniqueIds.size() != request.medicineIds().size()) {
            throw new ValidationException("medicineIds", "medicineIds must not contain duplicates");
        }

        Patient patient = patientRepository.findById(request.patientId())
                .orElseThrow(() -> new ResourceNotFoundException("Patient not found"));

        Map<UUID, Medicine> medicinesById = loadMedicinesMap(request.medicineIds());

        if (caller.getRole() != Role.DOCTOR
                || caller.getDoctorId() == null
                || !patientService.isDoctorOwnPatient(caller.getDoctorId(), patient.getId())) {
            throw new ForbiddenException("Doctor does not have access to check prescriptions for this patient");
        }

        List<Medicine> orderedMedicines = request.medicineIds().stream()
                .map(medicinesById::get)
                .toList();
        return new PrescriptionCheckResponse(evaluateWarnings(patient.getAllergies(), orderedMedicines));
    }

    public List<PrescriptionWarningDto> evaluateWarnings(List<String> allergies, List<Medicine> medicines) {
        List<PrescriptionWarningDto> warnings = new ArrayList<>();
        Map<String, String> normalizedAllergies = new HashMap<>();
        if (allergies != null) {
            for (String allergy : allergies) {
                if (allergy != null) {
                    String trimmed = allergy.trim();
                    if (!trimmed.isEmpty()) {
                        normalizedAllergies.putIfAbsent(trimmed.toLowerCase(Locale.ROOT), trimmed);
                    }
                }
            }
        }

        if (!normalizedAllergies.isEmpty()) {
            for (Medicine medicine : medicines) {
                String matchedAllergy = findMatchedAllergy(medicine, normalizedAllergies);
                if (matchedAllergy != null) {
                    warnings.add(new PrescriptionWarningDto(
                            WarningType.ALLERGY,
                            WarningSeverity.SEVERE,
                            List.of(new MedicineRef(medicine.getId(), medicine.getName())),
                            "Patient has a documented allergy to '" + matchedAllergy + "' matching " + medicine.getName() + "."));
                }
            }
        }

        if (medicines.size() >= 2) {
            Map<UUID, Medicine> byId = new HashMap<>();
            for (Medicine medicine : medicines) {
                byId.put(medicine.getId(), medicine);
            }
            List<DrugInteraction> interactions = drugInteractionRepository.findInteractionsAmong(byId.keySet());
            for (DrugInteraction interaction : interactions) {
                Medicine medA = byId.get(interaction.getMedicineAId());
                Medicine medB = byId.get(interaction.getMedicineBId());
                if (medA != null && medB != null) {
                    warnings.add(new PrescriptionWarningDto(
                            WarningType.INTERACTION,
                            interaction.getSeverity(),
                            List.of(
                                    new MedicineRef(medA.getId(), medA.getName()),
                                    new MedicineRef(medB.getId(), medB.getName())),
                            interaction.getMessage()));
                }
            }
        }

        warnings.sort(WARNING_COMPARATOR);
        return warnings;
    }

    public Map<UUID, Medicine> loadMedicinesMap(List<UUID> medicineIds) {
        List<Medicine> found = medicineRepository.findAllById(medicineIds);
        Map<UUID, Medicine> map = new HashMap<>();
        for (Medicine medicine : found) {
            map.put(medicine.getId(), medicine);
        }
        for (UUID requestedId : medicineIds) {
            if (!map.containsKey(requestedId)) {
                throw new ResourceNotFoundException("Medicine not found: " + requestedId);
            }
        }
        return map;
    }

    private static String findMatchedAllergy(Medicine medicine, Map<String, String> normalizedAllergies) {
        String match = normalizedAllergies.get(medicine.getName().trim().toLowerCase(Locale.ROOT));
        if (match != null) {
            return match;
        }
        match = normalizedAllergies.get(medicine.getGenericName().trim().toLowerCase(Locale.ROOT));
        if (match != null) {
            return match;
        }
        if (medicine.getDrugClass() != null) {
            return normalizedAllergies.get(medicine.getDrugClass().trim().toLowerCase(Locale.ROOT));
        }
        return null;
    }

    private static int severityRank(WarningSeverity severity) {
        return switch (severity) {
            case SEVERE -> 0;
            case MODERATE -> 1;
            case MILD -> 2;
        };
    }

    private static int typeRank(WarningType type) {
        return switch (type) {
            case ALLERGY -> 0;
            case INTERACTION -> 1;
        };
    }
}
