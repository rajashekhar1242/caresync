package com.caresync.billing.repository;

import com.caresync.billing.entity.CreditNote;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CreditNoteRepository extends JpaRepository<CreditNote, UUID> {

    List<CreditNote> findByInvoice_IdOrderByCreatedAtAscIdAsc(UUID invoiceId);
}
