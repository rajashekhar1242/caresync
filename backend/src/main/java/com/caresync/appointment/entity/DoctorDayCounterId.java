package com.caresync.appointment.entity;

import java.io.Serializable;
import java.time.LocalDate;
import java.util.Objects;
import java.util.UUID;

public class DoctorDayCounterId implements Serializable {

    private UUID doctorId;
    private LocalDate counterDate;

    public DoctorDayCounterId() {
    }

    public DoctorDayCounterId(UUID doctorId, LocalDate counterDate) {
        this.doctorId = doctorId;
        this.counterDate = counterDate;
    }

    public UUID getDoctorId() {
        return doctorId;
    }

    public LocalDate getCounterDate() {
        return counterDate;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof DoctorDayCounterId that)) {
            return false;
        }
        return Objects.equals(doctorId, that.doctorId) && Objects.equals(counterDate, that.counterDate);
    }

    @Override
    public int hashCode() {
        return Objects.hash(doctorId, counterDate);
    }
}
