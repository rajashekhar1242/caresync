package com.caresync.prescription.repository;

import com.caresync.prescription.entity.Prescription;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PrescriptionRepository extends JpaRepository<Prescription, UUID> {

    @EntityGraph(attributePaths = {
        "consultation", "appointment", "appointment.clinic", "patient", "doctor", "doctor.user"
    })
    @Query("SELECT p FROM Prescription p WHERE p.id = :id")
    Optional<Prescription> findWithDetailsById(@Param("id") UUID id);

    @EntityGraph(attributePaths = {"consultation", "appointment", "patient", "doctor", "doctor.user"})
    Page<Prescription> findByPatient_IdOrderByCreatedAtDescIdDesc(UUID patientId, Pageable pageable);

    boolean existsByConsultation_Id(UUID consultationId);
}
