package com.caresync.doctor.entity;

import com.caresync.auth.entity.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "doctors")
public class Doctor {

    @Id
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(name = "specialization_id", nullable = false)
    private UUID specializationId;

    @Column(name = "clinic_id", nullable = false)
    private UUID clinicId;

    @Column(name = "department_id", nullable = false)
    private UUID departmentId;

    @Column(length = 20)
    private String phone;

    @Column(name = "consultation_fee", nullable = false, precision = 12, scale = 2)
    private BigDecimal consultationFee;

    @Column(name = "slot_minutes", nullable = false)
    private int slotMinutes;

    @Column(nullable = false)
    private boolean active;

    protected Doctor() {
    }

    public Doctor(
            UUID id,
            User user,
            UUID specializationId,
            UUID clinicId,
            UUID departmentId,
            String phone,
            BigDecimal consultationFee,
            int slotMinutes,
            boolean active) {
        this.id = id;
        this.user = user;
        this.specializationId = specializationId;
        this.clinicId = clinicId;
        this.departmentId = departmentId;
        this.phone = phone;
        this.consultationFee = consultationFee;
        this.slotMinutes = slotMinutes;
        this.active = active;
    }

    public UUID getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public UUID getUserId() {
        return user.getId();
    }

    public UUID getSpecializationId() {
        return specializationId;
    }

    public void setSpecializationId(UUID specializationId) {
        this.specializationId = specializationId;
    }

    public UUID getClinicId() {
        return clinicId;
    }

    public void setClinicId(UUID clinicId) {
        this.clinicId = clinicId;
    }

    public UUID getDepartmentId() {
        return departmentId;
    }

    public void setDepartmentId(UUID departmentId) {
        this.departmentId = departmentId;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public BigDecimal getConsultationFee() {
        return consultationFee;
    }

    public void setConsultationFee(BigDecimal consultationFee) {
        this.consultationFee = consultationFee;
    }

    public int getSlotMinutes() {
        return slotMinutes;
    }

    public void setSlotMinutes(int slotMinutes) {
        this.slotMinutes = slotMinutes;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
