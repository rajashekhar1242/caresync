package com.caresync.doctor.repository;

import com.caresync.doctor.entity.Doctor;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface DoctorRepository extends JpaRepository<Doctor, UUID>, JpaSpecificationExecutor<Doctor> {

    @Override
    @EntityGraph(attributePaths = "user")
    Page<Doctor> findAll(Specification<Doctor> spec, Pageable pageable);

    @EntityGraph(attributePaths = "user")
    Optional<Doctor> findWithUserById(UUID id);

    @EntityGraph(attributePaths = "user")
    List<Doctor> findByClinicIdOrderByUser_FullNameAscIdAsc(UUID clinicId);
}
