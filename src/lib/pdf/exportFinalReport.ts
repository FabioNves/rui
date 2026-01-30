"use client";

export async function exportFinalReportToPdf(
  markdown: string,
  articleTitle?: string,
  fileName?: string,
) {
  if (typeof window === "undefined") {
    throw new Error("PDF export is only available in the browser");
  }

  const { default: jsPDF } = await import("jspdf");

  const pdf = new jsPDF({
    orientation: "p",
    unit: "pt",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const headerHeight = 30;
  const contentWidth = pageWidth - margin * 2;
  let y = margin + headerHeight; // Start below header

  const colors = {
    title: "#18181b",
    heading: "#27272a",
    subheading: "#3f3f46",
    text: "#52525b",
    muted: "#71717a",
  };

  // Helper to check page break
  const checkPageBreak = (requiredHeight: number) => {
    if (y + requiredHeight > pageHeight - margin) {
      pdf.addPage();
      y = margin + headerHeight; // Account for header on new pages
    }
  };

  // Helper to clean markdown formatting from text
  const cleanText = (text: string): string => {
    return text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links
      .replace(/`([^`]+)`/g, "$1") // Inline code
      .replace(/\*\*\*([^*]+)\*\*\*/g, "$1") // Bold+italic
      .replace(/\*\*([^*]+)\*\*/g, "$1") // Bold
      .replace(/\*([^*]+)\*/g, "$1") // Italic
      .replace(/__([^_]+)__/g, "$1") // Bold alt
      .replace(/_([^_]+)_/g, "$1"); // Italic alt
  };

  // Helper to add text with word wrap
  const addText = (
    text: string | undefined | null,
    fontSize: number,
    color: string,
    bold = false,
    indent = 0,
  ) => {
    if (!text) return;
    const cleanedText = cleanText(String(text));
    pdf.setFontSize(fontSize);
    pdf.setTextColor(color);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    const lines = pdf.splitTextToSize(cleanedText, contentWidth - indent);
    for (const line of lines) {
      checkPageBreak(fontSize * 1.5);
      pdf.text(line, margin + indent, y);
      y += fontSize * 1.5;
    }
  };

  // Parse markdown and render to PDF
  const lines = markdown.split("\n");
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        if (codeBlockContent.length > 0) {
          checkPageBreak(codeBlockContent.length * 12 + 24);
          pdf.setFillColor("#f4f4f5");
          const codeHeight = codeBlockContent.length * 12 + 16;
          pdf.roundedRect(margin, y - 4, contentWidth, codeHeight, 4, 4, "F");
          y += 8;
          for (const codeLine of codeBlockContent) {
            pdf.setFontSize(9);
            pdf.setTextColor("#3f3f46");
            pdf.setFont("courier", "normal");
            const trimmedLine =
              codeLine.length > 90 ? codeLine.slice(0, 87) + "..." : codeLine;
            pdf.text(trimmedLine, margin + 8, y);
            y += 12;
          }
          y += 12;
        }
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Skip empty lines but add spacing
    if (line.trim() === "") {
      y += 6;
      continue;
    }

    // Handle headings
    if (line.startsWith("# ")) {
      checkPageBreak(40);
      y += 16;
      addText(line.slice(2), 20, colors.title, true);
      y += 4;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 16;
      continue;
    }

    if (line.startsWith("## ")) {
      checkPageBreak(30);
      y += 12;
      addText(line.slice(3), 15, colors.heading, true);
      y += 4;
      continue;
    }

    if (line.startsWith("### ")) {
      checkPageBreak(24);
      y += 8;
      addText(line.slice(4), 12, colors.subheading, true);
      y += 2;
      continue;
    }

    if (line.startsWith("#### ")) {
      checkPageBreak(20);
      y += 6;
      addText(line.slice(5), 11, colors.subheading, true);
      continue;
    }

    // Handle horizontal rules
    if (line.match(/^[-*_]{3,}$/)) {
      checkPageBreak(20);
      y += 8;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 12;
      continue;
    }

    // Handle blockquotes
    if (line.startsWith("> ")) {
      checkPageBreak(24);
      const quoteText = cleanText(line.slice(2));
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(colors.subheading);
      const quoteLines = pdf.splitTextToSize(quoteText, contentWidth - 20);

      // Draw left border
      pdf.setDrawColor("#10b981");
      pdf.setLineWidth(2);
      const quoteHeight = quoteLines.length * 14;
      pdf.line(margin, y - 2, margin, y + quoteHeight);
      pdf.setLineWidth(1);

      for (const quoteLine of quoteLines) {
        checkPageBreak(14);
        pdf.text(quoteLine, margin + 12, y);
        y += 14;
      }
      y += 6;
      continue;
    }

    // Handle unordered lists
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (ulMatch) {
      const indentLevel = Math.floor(ulMatch[1].length / 2);
      const content = ulMatch[2];
      const indent = indentLevel * 16;
      checkPageBreak(16);

      // Draw bullet
      pdf.setFillColor(colors.text);
      pdf.circle(margin + indent + 4, y - 3, 1.5, "F");

      addText(content, 10, colors.text, false, indent + 14);
      continue;
    }

    // Handle ordered lists
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (olMatch) {
      const indentLevel = Math.floor(olMatch[1].length / 2);
      const num = olMatch[2];
      const content = olMatch[3];
      const indent = indentLevel * 16;
      checkPageBreak(16);

      pdf.setFontSize(10);
      pdf.setTextColor(colors.text);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${num}.`, margin + indent, y);

      addText(content, 10, colors.text, false, indent + 18);
      continue;
    }

    // Regular paragraph
    addText(line, 10, colors.text, false, 0);
  }

  // Footer on all pages
  const totalPages = pdf.getNumberOfPages();
  const headerText = articleTitle
    ? `Critical Analysis — ${articleTitle}`
    : "Critical Analysis";

  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);

    // Header
    pdf.setFontSize(9);
    pdf.setTextColor(colors.muted);
    pdf.setFont("helvetica", "normal");
    const truncatedHeader =
      headerText.length > 80 ? headerText.slice(0, 77) + "..." : headerText;
    pdf.text(truncatedHeader, margin, margin + 10);
    pdf.setDrawColor(220, 220, 220);
    pdf.line(margin, margin + 18, pageWidth - margin, margin + 18);

    // Footer - just page number
    pdf.setFontSize(8);
    pdf.setTextColor(colors.muted);
    pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 20, {
      align: "center",
    });
  }

  // Generate filename from article title
  const safeFileName = articleTitle
    ? `${articleTitle
        .slice(0, 50)
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")}-critical-analysis.pdf`
    : "critical-analysis.pdf";

  pdf.save(fileName ?? safeFileName);
}
