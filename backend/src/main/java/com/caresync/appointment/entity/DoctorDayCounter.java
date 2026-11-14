package com.caresync.appointment.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "doctor_day_counters")
@IdClass(DoctorDayCounterId.class)
public class DoctorDayCounter {

    @Id
    @Column(name = "doctor_id", nullable = false)
    private UUID doctorId;

    @Id
    @Column(name = "counter_date", nullable = false)
    private LocalDate counterDate;

    @Column(name = "last_token", nullable = false)
    private int lastToken;

    protected DoctorDayCounter() {
    }

    public DoctorDayCounter(UUID doctorId, LocalDate counterDate, int lastToken) {
        this.doctorId = doctorId;
        this.counterDate = counterDate;
        this.lastToken = lastToken;
    }

    public UUID getDoctorId() {
        return doctorId;
    }

    public LocalDate getCounterDate() {
        return counterDate;
    }

    public int getLastToken() {
        return lastToken;
    }
}
