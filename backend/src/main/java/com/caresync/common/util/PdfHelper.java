package com.caresync.common.util;

import java.awt.Color;
import org.openpdf.text.Element;
import org.openpdf.text.Font;
import org.openpdf.text.FontFactory;
import org.openpdf.text.Paragraph;
import org.openpdf.text.Phrase;
import org.openpdf.text.pdf.PdfPCell;
import org.openpdf.text.pdf.PdfPTable;

/**
 * Shared OpenPDF typography and table cell builders used across prescription and invoice PDFs.
 */
public final class PdfHelper {

    public static final Font TITLE_FONT = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 16, Color.DARK_GRAY);
    public static final Font SUBTITLE_FONT = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11, Color.DARK_GRAY);
    public static final Font BODY_FONT = FontFactory.getFont(FontFactory.HELVETICA, 10, Color.BLACK);
    public static final Font BODY_BOLD_FONT = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10, Color.BLACK);
    public static final Font TABLE_HEADER_FONT = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, Color.WHITE);
    public static final Font SMALL_MUTED_FONT = FontFactory.getFont(FontFactory.HELVETICA, 9, Color.GRAY);

    private static final Color HEADER_BG = new Color(41, 72, 109);
    private static final Color BORDER_COLOR = new Color(210, 215, 222);

    private PdfHelper() {
    }

    public static Paragraph sectionHeading(String title) {
        Paragraph p = new Paragraph(title, SUBTITLE_FONT);
        p.setSpacingBefore(10f);
        p.setSpacingAfter(4f);
        return p;
    }

    public static void addHeaderCells(PdfPTable table, String... labels) {
        for (String label : labels) {
            PdfPCell cell = new PdfPCell(new Phrase(label, TABLE_HEADER_FONT));
            cell.setBackgroundColor(HEADER_BG);
            cell.setBorderColor(BORDER_COLOR);
            cell.setPadding(6f);
            cell.setHorizontalAlignment(Element.ALIGN_LEFT);
            table.addCell(cell);
        }
    }

    public static PdfPCell bodyCell(String text) {
        return bodyCell(text, Element.ALIGN_LEFT);
    }

    public static PdfPCell bodyCell(String text, int horizontalAlignment) {
        PdfPCell cell = new PdfPCell(new Phrase(text == null ? "-" : text, BODY_FONT));
        cell.setBorderColor(BORDER_COLOR);
        cell.setPadding(5f);
        cell.setHorizontalAlignment(horizontalAlignment);
        return cell;
    }
}
