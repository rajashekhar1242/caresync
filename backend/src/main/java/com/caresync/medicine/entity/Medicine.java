package com.caresync.medicine.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "medicines")
public class Medicine {

    @Id
    private UUID id;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "generic_name", nullable = false, length = 200)
    private String genericName;

    @Column(nullable = false, length = 100)
    private String strength;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MedicineForm form;

    @Column(name = "drug_class", length = 150)
    private String drugClass;

    protected Medicine() {
    }

    public Medicine(
            UUID id,
            String name,
            String genericName,
            String strength,
            MedicineForm form,
            String drugClass) {
        this.id = id;
        this.name = name;
        this.genericName = genericName;
        this.strength = strength;
        this.form = form;
        this.drugClass = drugClass;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getGenericName() {
        return genericName;
    }

    public String getStrength() {
        return strength;
    }

    public MedicineForm getForm() {
        return form;
    }

    public String getDrugClass() {
        return drugClass;
    }
}
