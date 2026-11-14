package com.caresync.doctor.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "leaves")
public class Leave {

    @Id
    private UUID id;

    @Column(name = "doctor_id", nullable = false)
    private UUID doctorId;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(length = 255)
    private String reason;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Leave() {
    }

    public Leave(UUID id, UUID doctorId, LocalDate startDate, LocalDate endDate, String reason, Instant createdAt) {
        this.id = id;
        this.doctorId = doctorId;
        this.startDate = startDate;
        this.endDate = endDate;
        this.reason = reason;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getDoctorId() {
        return doctorId;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public String getReason() {
        return reason;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
