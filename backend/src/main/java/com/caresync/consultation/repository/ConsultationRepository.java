package com.caresync.consultation.repository;

import com.caresync.consultation.entity.Consultation;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConsultationRepository extends JpaRepository<Consultation, UUID> {

    @EntityGraph(attributePaths = {"appointment", "appointment.clinic", "patient", "doctor", "doctor.user"})
    @Query("SELECT c FROM Consultation c WHERE c.id = :id")
    Optional<Consultation> findWithDetailsById(@Param("id") UUID id);

    @EntityGraph(attributePaths = {"appointment", "appointment.clinic", "patient", "doctor", "doctor.user"})
    @Query("SELECT c FROM Consultation c WHERE c.appointment.id = :appointmentId")
    Optional<Consultation> findWithDetailsByAppointmentId(@Param("appointmentId") UUID appointmentId);

    boolean existsByAppointment_Id(UUID appointmentId);

    boolean existsByDoctor_IdAndPatient_Id(UUID doctorId, UUID patientId);
}
