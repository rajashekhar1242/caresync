package com.caresync.reference.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "clinics")
public class Clinic {

    @Id
    private UUID id;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(length = 500)
    private String address;

    @Column(name = "time_zone", nullable = false, length = 64)
    private String timeZone;

    protected Clinic() {
    }

    public Clinic(UUID id, String name, String address, String timeZone) {
        this.id = id;
        this.name = name;
        this.address = address;
        this.timeZone = timeZone;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getAddress() {
        return address;
    }

    public String getTimeZone() {
        return timeZone;
    }
}
