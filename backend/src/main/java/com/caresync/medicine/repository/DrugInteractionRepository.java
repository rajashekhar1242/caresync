package com.caresync.medicine.repository;

import com.caresync.medicine.entity.DrugInteraction;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DrugInteractionRepository extends JpaRepository<DrugInteraction, UUID> {

    @Query("""
            SELECT d FROM DrugInteraction d
            WHERE d.medicineAId IN :medicineIds
              AND d.medicineBId IN :medicineIds
            """)
    List<DrugInteraction> findInteractionsAmong(@Param("medicineIds") Collection<UUID> medicineIds);
}
