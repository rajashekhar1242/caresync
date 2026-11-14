package com.caresync.doctor.repository;

import com.caresync.doctor.entity.Leave;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LeaveRepository extends JpaRepository<Leave, UUID> {

    List<Leave> findByDoctorIdOrderByStartDateAscIdAsc(UUID doctorId);

    Optional<Leave> findByIdAndDoctorId(UUID id, UUID doctorId);

    @Query("""
            SELECT COUNT(l) > 0 FROM Leave l
            WHERE l.doctorId = :doctorId
              AND l.startDate <= :endDate
              AND l.endDate >= :startDate
            """)
    boolean existsOverlappingLeave(
            @Param("doctorId") UUID doctorId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    @Query("""
            SELECT DISTINCT l.doctorId FROM Leave l
            WHERE l.doctorId IN :doctorIds
              AND l.startDate <= :date
              AND l.endDate >= :date
            """)
    Set<UUID> findDoctorIdsOnLeave(
            @Param("doctorIds") Collection<UUID> doctorIds,
            @Param("date") LocalDate date);

    @Query("""
            SELECT l FROM Leave l
            WHERE l.doctorId = :doctorId
              AND (:fromDate IS NULL OR l.endDate >= :fromDate)
              AND (:toDate IS NULL OR l.startDate <= :toDate)
            ORDER BY l.startDate ASC, l.id ASC
            """)
    List<Leave> findOverlappingRange(
            @Param("doctorId") UUID doctorId,
            @Param("fromDate") LocalDate fromDate,
            @Param("toDate") LocalDate toDate);
}
