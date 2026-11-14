package com.caresync.billing.repository;

import com.caresync.billing.entity.InvoiceItem;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvoiceItemRepository extends JpaRepository<InvoiceItem, UUID> {

    List<InvoiceItem> findByInvoice_IdOrderBySortOrderAscCreatedAtAsc(UUID invoiceId);

    @Query("SELECT COALESCE(MAX(i.sortOrder), -1) + 1 FROM InvoiceItem i WHERE i.invoice.id = :invoiceId")
    int nextSortOrder(@Param("invoiceId") UUID invoiceId);
}
