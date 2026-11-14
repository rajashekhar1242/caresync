package com.caresync.appointment.repository;

import com.caresync.appointment.entity.DoctorDayCounter;
import com.caresync.appointment.entity.DoctorDayCounterId;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DoctorDayCounterRepository extends JpaRepository<DoctorDayCounter, DoctorDayCounterId> {

    List<DoctorDayCounter> findByDoctorIdInAndCounterDate(Collection<UUID> doctorIds, LocalDate counterDate);

    @Query(
            value = """
                    INSERT INTO doctor_day_counters (doctor_id, counter_date, last_token)
                    VALUES (:doctorId, :counterDate, 1)
                    ON CONFLICT (doctor_id, counter_date)
                    DO UPDATE SET last_token = doctor_day_counters.last_token + 1
                    RETURNING last_token
                    """,
            nativeQuery = true)
    int incrementAndGetNextToken(@Param("doctorId") UUID doctorId, @Param("counterDate") LocalDate counterDate);
}
