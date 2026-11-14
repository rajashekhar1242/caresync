package com.caresync.prescription.service;

import com.caresync.common.util.PdfHelper;
import com.caresync.common.util.TimeZoneUtils;
import com.caresync.prescription.entity.Prescription;
import com.caresync.prescription.entity.PrescriptionItem;
import com.caresync.prescription.entity.PrescriptionWarning;
import java.io.ByteArrayOutputStream;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.openpdf.text.Document;
import org.openpdf.text.PageSize;
import org.openpdf.text.Paragraph;
import org.openpdf.text.pdf.PdfPTable;
import org.openpdf.text.pdf.PdfWriter;
import org.springframework.stereotype.Service;

@Service
public class PrescriptionPdfService {

    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm z");

    public byte[] render(Prescription prescription) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A4, 36, 36, 36, 36);
        PdfWriter.getInstance(document, out);
        document.open();

        var clinic = prescription.getAppointment().getClinic();
        ZoneId clinicZone = TimeZoneUtils.resolveZone(clinic.getTimeZone());
        String issuedAt = DATE_TIME_FORMATTER.format(prescription.getCreatedAt().atZone(clinicZone));

        Paragraph clinicTitle = new Paragraph(clinic.getName(), PdfHelper.TITLE_FONT);
        document.add(clinicTitle);
        if (clinic.getAddress() != null && !clinic.getAddress().isBlank()) {
            document.add(new Paragraph(clinic.getAddress(), PdfHelper.SMALL_MUTED_FONT));
        }

        Paragraph docHeader = PdfHelper.sectionHeading("Prescription");
        document.add(docHeader);
        document.add(new Paragraph("Prescription ID: " + prescription.getId(), PdfHelper.BODY_FONT));
        document.add(new Paragraph("Issued: " + issuedAt, PdfHelper.BODY_FONT));
        document.add(new Paragraph("Patient: " + prescription.getPatient().getFullName(), PdfHelper.BODY_BOLD_FONT));
        document.add(new Paragraph("Prescribing Doctor: " + prescription.getDoctor().getUser().getFullName(), PdfHelper.BODY_FONT));

        String diagnosis = prescription.getConsultation().getDiagnosis();
        if (diagnosis != null && !diagnosis.isBlank()) {
            document.add(new Paragraph("Diagnosis: " + diagnosis, PdfHelper.BODY_FONT));
        }

        List<String> allergies = prescription.getPatient().getAllergies();
        if (allergies != null && !allergies.isEmpty()) {
            document.add(new Paragraph("Recorded Allergies: " + String.join(", ", allergies), PdfHelper.BODY_FONT));
        }

        document.add(PdfHelper.sectionHeading("Prescribed Medicines"));
        PdfPTable table = new PdfPTable(new float[]{2.5f, 1.5f, 1.3f, 1.3f, 1.0f, 2.4f});
        table.setWidthPercentage(100f);
        PdfHelper.addHeaderCells(table, "Medicine", "Strength / Form", "Dosage", "Frequency", "Days", "Instructions");

        for (PrescriptionItem item : prescription.getItems()) {
            var med = item.getMedicine();
            table.addCell(PdfHelper.bodyCell(med.getName() + " (" + med.getGenericName() + ")"));
            table.addCell(PdfHelper.bodyCell(med.getStrength() + " / " + med.getForm().name()));
            table.addCell(PdfHelper.bodyCell(item.getDosage()));
            table.addCell(PdfHelper.bodyCell(item.getFrequency()));
            table.addCell(PdfHelper.bodyCell(String.valueOf(item.getDurationDays())));
            table.addCell(PdfHelper.bodyCell(item.getInstructions()));
        }
        document.add(table);

        List<PrescriptionWarning> warnings = prescription.getWarnings();
        if (!warnings.isEmpty()) {
            document.add(PdfHelper.sectionHeading("Safety Warnings"));
            if (prescription.isSevereWarningsAcknowledged()) {
                document.add(new Paragraph("Severe warnings acknowledged by prescribing doctor.", PdfHelper.BODY_BOLD_FONT));
            }
            for (PrescriptionWarning warning : warnings) {
                document.add(new Paragraph(
                        "[" + warning.getSeverity() + " / " + warning.getWarningType() + "] " + warning.getMessage(),
                        PdfHelper.BODY_FONT));
            }
        }

        document.close();
        return out.toByteArray();
    }
}
