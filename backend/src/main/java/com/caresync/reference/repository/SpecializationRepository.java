package com.caresync.reference.repository;

import com.caresync.reference.entity.Specialization;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SpecializationRepository extends JpaRepository<Specialization, UUID> {

    List<Specialization> findAllByOrderByNameAsc();
}
