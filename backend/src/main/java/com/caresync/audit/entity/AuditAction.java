package com.caresync.audit.entity;

/**
 * Audited operations defined by the OpenAPI {@code AuditAction} contract.
 */
public enum AuditAction {
    PATIENT_READ(AuditEntityType.PATIENT),
    CONSULTATION_CREATED(AuditEntityType.CONSULTATION),
    CONSULTATION_UPDATED(AuditEntityType.CONSULTATION),
    CONSULTATION_FINALIZED(AuditEntityType.CONSULTATION),
    CONSULTATION_READ(AuditEntityType.CONSULTATION),
    PRESCRIPTION_CREATED(AuditEntityType.PRESCRIPTION),
    PRESCRIPTION_READ(AuditEntityType.PRESCRIPTION),
    PRESCRIPTION_LIST_READ(AuditEntityType.PATIENT),
    PRESCRIPTION_PDF_DOWNLOADED(AuditEntityType.PRESCRIPTION),
    INVOICE_CREATED(AuditEntityType.INVOICE),
    INVOICE_READ(AuditEntityType.INVOICE),
    INVOICE_ITEM_ADDED(AuditEntityType.INVOICE),
    PAYMENT_RECORDED(AuditEntityType.INVOICE),
    CREDIT_NOTE_ISSUED(AuditEntityType.INVOICE),
    INVOICE_VOIDED(AuditEntityType.INVOICE),
    INVOICE_PDF_DOWNLOADED(AuditEntityType.INVOICE);

    private final AuditEntityType entityType;

    AuditAction(AuditEntityType entityType) {
        this.entityType = entityType;
    }

    public AuditEntityType getEntityType() {
        return entityType;
    }
}
