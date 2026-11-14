package com.caresync.reference.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "specializations")
public class Specialization {

    @Id
    private UUID id;

    @Column(nullable = false, length = 100)
    private String name;

    protected Specialization() {
    }

    public Specialization(UUID id, String name) {
        this.id = id;
        this.name = name;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }
}
