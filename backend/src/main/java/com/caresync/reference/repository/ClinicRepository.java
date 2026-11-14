package com.caresync.reference.repository;

import com.caresync.reference.entity.Clinic;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClinicRepository extends JpaRepository<Clinic, UUID> {

    List<Clinic> findAllByOrderByNameAsc();
}
