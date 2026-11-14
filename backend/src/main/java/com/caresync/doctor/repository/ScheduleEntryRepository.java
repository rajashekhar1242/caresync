package com.caresync.doctor.repository;

import com.caresync.doctor.entity.ScheduleEntry;
import java.time.DayOfWeek;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ScheduleEntryRepository extends JpaRepository<ScheduleEntry, UUID> {

    List<ScheduleEntry> findByDoctorIdOrderByDayOfWeekAscStartTimeAsc(UUID doctorId);

    List<ScheduleEntry> findByDoctorIdAndDayOfWeekOrderByStartTimeAsc(UUID doctorId, DayOfWeek dayOfWeek);

    @Query("""
            SELECT DISTINCT s.doctorId FROM ScheduleEntry s
            WHERE s.doctorId IN :doctorIds
              AND s.dayOfWeek = :dayOfWeek
            """)
    Set<UUID> findDoctorIdsWithScheduleOnDay(
            @Param("doctorIds") Collection<UUID> doctorIds,
            @Param("dayOfWeek") DayOfWeek dayOfWeek);

    @Modifying
    @Query("DELETE FROM ScheduleEntry s WHERE s.doctorId = :doctorId")
    void deleteAllByDoctorId(@Param("doctorId") UUID doctorId);
}
