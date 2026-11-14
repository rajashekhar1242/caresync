package com.caresync.billing.repository;

import com.caresync.billing.entity.Invoice;
import com.caresync.billing.entity.InvoiceStatus;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvoiceRepository extends JpaRepository<Invoice, UUID>, JpaSpecificationExecutor<Invoice> {

    @Override
    @EntityGraph(attributePaths = {"patient", "doctor", "doctor.user"})
    Page<Invoice> findAll(Specification<Invoice> spec, Pageable pageable);

    @EntityGraph(attributePaths = {"appointment", "patient", "doctor", "doctor.user", "clinic"})
    @Query("SELECT i FROM Invoice i WHERE i.id = :id")
    Optional<Invoice> findWithDetailsById(@Param("id") UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT i FROM Invoice i WHERE i.id = :id")
    Optional<Invoice> findLockedById(@Param("id") UUID id);

    @EntityGraph(attributePaths = {"appointment", "patient", "doctor", "doctor.user", "clinic"})
    Optional<Invoice> findFirstByAppointment_IdAndStatusNotOrderByCreatedAtDescIdDesc(
            UUID appointmentId, InvoiceStatus excludedStatus);

    boolean existsByAppointment_IdAndStatusNot(UUID appointmentId, InvoiceStatus excludedStatus);

    @Query(value = "SELECT nextval('invoice_number_seq')", nativeQuery = true)
    long nextInvoiceSequence();

    @Query(value = "SELECT nextval('credit_note_number_seq')", nativeQuery = true)
    long nextCreditNoteSequence();
}
