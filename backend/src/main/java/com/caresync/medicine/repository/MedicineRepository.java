package com.caresync.medicine.repository;

import com.caresync.medicine.entity.Medicine;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MedicineRepository extends JpaRepository<Medicine, UUID> {

    @Query("""
            SELECT m FROM Medicine m
            WHERE LOWER(m.name) LIKE :pattern
               OR LOWER(m.genericName) LIKE :pattern
               OR LOWER(COALESCE(m.drugClass, '')) LIKE :pattern
            """)
    Page<Medicine> searchByKeyword(@Param("pattern") String pattern, Pageable pageable);
}
