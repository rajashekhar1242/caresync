package com.caresync.billing.service;

import com.caresync.billing.entity.CreditNote;
import com.caresync.billing.entity.Invoice;
import com.caresync.billing.entity.InvoiceItem;
import com.caresync.billing.entity.Payment;
import com.caresync.common.util.MoneyUtils;
import com.caresync.common.util.PdfHelper;
import com.caresync.common.util.TimeZoneUtils;
import java.io.ByteArrayOutputStream;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.openpdf.text.Document;
import org.openpdf.text.Element;
import org.openpdf.text.PageSize;
import org.openpdf.text.Paragraph;
import org.openpdf.text.pdf.PdfPTable;
import org.openpdf.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

/**
 * Renders an A4 PDF representation of an {@link Invoice} including line items,
 * payments, credit notes, and totals using OpenPDF.
 */
@Service
public class InvoicePdfService {

    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm z");

    public byte[] render(
            Invoice invoice,
            List<InvoiceItem> items,
            List<Payment> payments,
            List<CreditNote> creditNotes) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, 36, 36, 36, 36);
        PdfWriter.getInstance(document, out);
        document.open();

        var clinic = invoice.getClinic();
        ZoneId clinicZone = TimeZoneUtils.resolveZone(clinic.getTimeZone());
        String createdAt = DATE_TIME_FORMATTER.format(invoice.getCreatedAt().atZone(clinicZone));

        document.add(new Paragraph(clinic.getName(), PdfHelper.TITLE_FONT));
        if (clinic.getAddress() != null && !clinic.getAddress().isBlank()) {
            document.add(new Paragraph(clinic.getAddress(), PdfHelper.SMALL_MUTED_FONT));
        }

        document.add(PdfHelper.sectionHeading("Invoice " + invoice.getInvoiceNumber()));
        document.add(new Paragraph("Status: " + invoice.getStatus().name(), PdfHelper.BODY_BOLD_FONT));
        document.add(new Paragraph("Issued: " + createdAt, PdfHelper.BODY_FONT));
        if (invoice.getPaidAt() != null) {
            document.add(new Paragraph(
                    "Paid: " + DATE_TIME_FORMATTER.format(invoice.getPaidAt().atZone(clinicZone)),
                    PdfHelper.BODY_FONT));
        }
        if (invoice.getVoidReason() != null && !invoice.getVoidReason().isBlank()) {
            document.add(new Paragraph("Void Reason: " + invoice.getVoidReason(), PdfHelper.BODY_FONT));
        }
        document.add(new Paragraph("Patient: " + invoice.getPatient().getFullName(), PdfHelper.BODY_BOLD_FONT));
        document.add(new Paragraph("Doctor: " + invoice.getDoctor().getUser().getFullName(), PdfHelper.BODY_FONT));
        document.add(new Paragraph("Currency: " + invoice.getCurrency().name(), PdfHelper.BODY_FONT));

        document.add(PdfHelper.sectionHeading("Line Items"));
        PdfPTable itemsTable = new PdfPTable(new float[]{4.2f, 1.0f, 1.8f, 1.8f});
        itemsTable.setWidthPercentage(100f);
        PdfHelper.addHeaderCells(itemsTable, "Description", "Qty", "Unit Price (INR)", "Line Total (INR)");
        for (InvoiceItem item : items) {
            itemsTable.addCell(PdfHelper.bodyCell(item.getDescription()));
            itemsTable.addCell(PdfHelper.bodyCell(String.valueOf(item.getQuantity()), Element.ALIGN_RIGHT));
            itemsTable.addCell(PdfHelper.bodyCell(MoneyUtils.format(item.getUnitPrice()), Element.ALIGN_RIGHT));
            itemsTable.addCell(PdfHelper.bodyCell(MoneyUtils.format(item.getLineTotal()), Element.ALIGN_RIGHT));
        }
        document.add(itemsTable);

        if (!payments.isEmpty()) {
            document.add(PdfHelper.sectionHeading("Payments"));
            PdfPTable paymentsTable = new PdfPTable(new float[]{2.4f, 1.6f, 2.2f, 2.0f, 1.8f});
            paymentsTable.setWidthPercentage(100f);
            PdfHelper.addHeaderCells(paymentsTable, "Date", "Method", "Reference", "Received By", "Amount (INR)");
            for (Payment payment : payments) {
                paymentsTable.addCell(PdfHelper.bodyCell(
                        DATE_TIME_FORMATTER.format(payment.getCreatedAt().atZone(clinicZone))));
                paymentsTable.addCell(PdfHelper.bodyCell(payment.getMethod().name()));
                paymentsTable.addCell(PdfHelper.bodyCell(payment.getTxnRef()));
                paymentsTable.addCell(PdfHelper.bodyCell(payment.getReceivedByName()));
                paymentsTable.addCell(PdfHelper.bodyCell(MoneyUtils.format(payment.getAmount()), Element.ALIGN_RIGHT));
            }
            document.add(paymentsTable);
        }

        if (!creditNotes.isEmpty()) {
            document.add(PdfHelper.sectionHeading("Credit Notes"));
            PdfPTable creditsTable = new PdfPTable(new float[]{2.2f, 2.2f, 3.0f, 1.8f, 1.8f});
            creditsTable.setWidthPercentage(100f);
            PdfHelper.addHeaderCells(creditsTable, "Credit Note #", "Date", "Reason", "Issued By", "Amount (INR)");
            for (CreditNote cn : creditNotes) {
                creditsTable.addCell(PdfHelper.bodyCell(cn.getCreditNoteNumber()));
                creditsTable.addCell(PdfHelper.bodyCell(
                        DATE_TIME_FORMATTER.format(cn.getCreatedAt().atZone(clinicZone))));
                creditsTable.addCell(PdfHelper.bodyCell(cn.getReason()));
                creditsTable.addCell(PdfHelper.bodyCell(cn.getCreatedByName()));
                creditsTable.addCell(PdfHelper.bodyCell(MoneyUtils.format(cn.getAmount()), Element.ALIGN_RIGHT));
            }
            document.add(creditsTable);
        }

        document.add(PdfHelper.sectionHeading("Summary"));
        document.add(new Paragraph("Total: INR " + MoneyUtils.format(invoice.getTotal()), PdfHelper.BODY_BOLD_FONT));
        document.add(new Paragraph("Amount Paid: INR " + MoneyUtils.format(invoice.getAmountPaid()), PdfHelper.BODY_FONT));
        document.add(new Paragraph("Balance Due: INR " + MoneyUtils.format(invoice.getBalance()), PdfHelper.BODY_BOLD_FONT));
        document.add(new Paragraph("Credited Total: INR " + MoneyUtils.format(invoice.getCreditedTotal()), PdfHelper.BODY_FONT));
        document.add(new Paragraph("Net Total: INR " + MoneyUtils.format(invoice.getNetTotal()), PdfHelper.BODY_BOLD_FONT));

        document.close();
        return out.toByteArray();
    }
}
