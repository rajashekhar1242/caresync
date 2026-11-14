package com.caresync.medicine.service;

import com.caresync.common.dto.PageResponse;
import com.caresync.common.exception.ValidationException;
import com.caresync.medicine.dto.MedicineResponse;
import com.caresync.medicine.entity.Medicine;
import com.caresync.medicine.repository.MedicineRepository;
import java.util.Locale;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class MedicineService {

    private static final Sort DEFAULT_SORT = Sort.by(Sort.Order.asc("name"), Sort.Order.asc("id"));

    private final MedicineRepository medicineRepository;

    public MedicineService(MedicineRepository medicineRepository) {
        this.medicineRepository = medicineRepository;
    }

    @Transactional(readOnly = true)
    public PageResponse<MedicineResponse> searchMedicines(String name, int page, int size) {
        Pageable pageable = PageRequest.of(page, size, DEFAULT_SORT);
        Page<Medicine> result;
        if (name == null) {
            result = medicineRepository.findAll(pageable);
        } else {
            String trimmed = name.trim();
            if (trimmed.length() < 2) {
                throw new ValidationException("name", "size must be between 2 and 100");
            }
            String pattern = "%" + escapeLike(trimmed.toLowerCase(Locale.ROOT)) + "%";
            result = medicineRepository.searchByKeyword(pattern, pageable);
        }
        return PageResponse.from(result.map(MedicineResponse::from));
    }

    private static String escapeLike(String value) {
        return value
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
    }
}
