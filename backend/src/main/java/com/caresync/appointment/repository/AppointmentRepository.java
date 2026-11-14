package com.caresync.appointment.repository;

import com.caresync.appointment.entity.Appointment;
import com.caresync.appointment.entity.AppointmentStatus;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppointmentRepository extends JpaRepository<Appointment, UUID>, JpaSpecificationExecutor<Appointment> {

    @EntityGraph(attributePaths = {"doctor", "doctor.user", "patient", "clinic"})
    @Query("SELECT a FROM Appointment a WHERE a.id = :id")
    Optional<Appointment> findWithDetailsById(@Param("id") UUID id);

    @Override
    @EntityGraph(attributePaths = {"doctor", "doctor.user", "patient", "clinic"})
    Page<Appointment> findAll(Specification<Appointment> spec, Pageable pageable);

    @Query("""
            SELECT CASE WHEN COUNT(a) > 0 THEN true ELSE false END
            FROM Appointment a
            WHERE a.doctor.id = :doctorId
              AND a.slotStart = :slotStart
              AND a.status <> com.caresync.appointment.entity.AppointmentStatus.CANCELLED
            """)
    boolean existsActiveAtSlot(@Param("doctorId") UUID doctorId, @Param("slotStart") Instant slotStart);

    boolean existsByDoctor_IdAndStatusAndIdNot(UUID doctorId, AppointmentStatus status, UUID id);

    boolean existsByDoctor_IdAndPatient_IdAndStatusNot(UUID doctorId, UUID patientId, AppointmentStatus status);

    @EntityGraph(attributePaths = {"doctor", "doctor.user", "patient", "clinic"})
    Optional<Appointment> findFirstByDoctor_IdAndStatus(UUID doctorId, AppointmentStatus status);

    @Query("""
            SELECT new com.caresync.appointment.repository.QueueBoardTokenProjection(
                    a.doctor.id, a.status, a.tokenNumber)
            FROM Appointment a
            WHERE a.doctor.id IN :doctorIds
              AND (a.status = com.caresync.appointment.entity.AppointmentStatus.IN_CONSULTATION
                   OR (a.status = com.caresync.appointment.entity.AppointmentStatus.CHECKED_IN
                       AND a.checkedInAt >= :dayStartUtc
                       AND a.checkedInAt < :dayEndUtc))
            ORDER BY a.doctor.id ASC, a.tokenNumber ASC
            """)
    List<QueueBoardTokenProjection> findBoardQueueTokens(
            @Param("doctorIds") Collection<UUID> doctorIds,
            @Param("dayStartUtc") Instant dayStartUtc,
            @Param("dayEndUtc") Instant dayEndUtc);

    @EntityGraph(attributePaths = {"doctor", "doctor.user", "patient", "clinic"})
    @Query("""
            SELECT a FROM Appointment a
            WHERE a.doctor.id = :doctorId
              AND a.status = com.caresync.appointment.entity.AppointmentStatus.CHECKED_IN
              AND a.checkedInAt >= :dayStartUtc
              AND a.checkedInAt < :dayEndUtc
            ORDER BY a.tokenNumber ASC
            """)
    List<Appointment> findTodayWaitingByDoctor(
            @Param("doctorId") UUID doctorId,
            @Param("dayStartUtc") Instant dayStartUtc,
            @Param("dayEndUtc") Instant dayEndUtc);
}
