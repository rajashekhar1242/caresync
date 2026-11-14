package com.caresync.billing.repository;

import com.caresync.billing.entity.Payment;
import com.caresync.billing.entity.PaymentMethod;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    List<Payment> findByInvoice_IdOrderByCreatedAtAscIdAsc(UUID invoiceId);

    boolean existsByMethodAndTxnRef(PaymentMethod method, String txnRef);
}
