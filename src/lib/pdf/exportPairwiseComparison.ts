"use client";

type PairwiseComparison = {
  relatedId: string;
  relatedTitle: string;
  isRelated: boolean;
  relatednessScore: number;
  relatednessExplanation: string;
  summary: string;
  dimensions: Array<{
    dimension: string;
    label: string;
    mainSummary: string;
    relatedSummary: string;
    mainScore?: number;
    relatedScore?: number;
    verdict:
      | "main_stronger"
      | "related_stronger"
      | "comparable"
      | "not_applicable";
    confidence: "high" | "medium" | "low";
  }>;
  similarities: Array<{
    claim: string;
    confidence: "high" | "medium" | "low";
  }>;
  differences: Array<{
    claim: string;
    confidence: "high" | "medium" | "low";
    favoredPaper: "main" | "related" | "neutral";
  }>;
  gapAnalysis: {
    uniqueToMain: string[];
    uniqueToRelated: string[];
    sharedGaps: string[];
  };
  contradictions: Array<{
    topic: string;
    mainPosition: string;
    relatedPosition: string;
    possibleExplanation: string;
  }>;
  methodologicalRigor: {
    sampleSizeAdequacy: { main: string; related: string; verdict: string };
    biasControls: { main: string; related: string; verdict: string };
    statisticalRigor: { main: string; related: string; verdict: string };
    replicability: { main: string; related: string; verdict: string };
  };
  temporalContext: {
    chronologicalNote: string;
    methodologicalEvolution: string;
    findingsProgression: string;
  };
  overallVerdict: {
    strongerPaper: "main" | "related" | "comparable";
    explanation: string;
  };
  recommendations: {
    forResearchers: string[];
    forPractitioners: string[];
    synthesizedConclusion: string;
  };
};

export async function exportPairwiseComparisonsToPdf(
  comparisons: Record<string, PairwiseComparison>,
  mainTitle?: string,
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
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const colors = {
    title: "#18181b",
    heading: "#27272a",
    subheading: "#3f3f46",
    text: "#52525b",
    accent: "#10b981",
    muted: "#71717a",
    emerald: "#10b981",
    blue: "#3b82f6",
    purple: "#a855f7",
    red: "#ef4444",
    orange: "#f97316",
    yellow: "#eab308",
  };

  // Helper to check page break
  const checkPageBreak = (requiredHeight: number) => {
    if (y + requiredHeight > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  // Helper to add text with word wrap
  const addText = (
    text: string | undefined | null,
    fontSize: number,
    color: string,
    bold = false,
    indent = 0,
  ) => {
    if (!text) return; // Skip if text is empty/undefined/null
    pdf.setFontSize(fontSize);
    pdf.setTextColor(color);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    const lines = pdf.splitTextToSize(String(text), contentWidth - indent);
    for (const line of lines) {
      checkPageBreak(fontSize * 1.4);
      pdf.text(line, margin + indent, y);
      y += fontSize * 1.4;
    }
  };

  // Helper to add a colored badge
  const addBadge = (
    text: string,
    x: number,
    bgColor: string,
    textColor: string,
  ) => {
    pdf.setFillColor(bgColor);
    const textWidth = pdf.getTextWidth(text) + 8;
    pdf.roundedRect(x, y - 8, textWidth, 12, 3, 3, "F");
    pdf.setTextColor(textColor);
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.text(text, x + 4, y);
    return textWidth + 4;
  };

  const comparisonsList = Object.values(comparisons);
  const relatedCount = comparisonsList.filter((c) => c.isRelated).length;
  const unrelatedCount = comparisonsList.filter((c) => !c.isRelated).length;

  // Title Page
  addText("Pairwise Comparative Analysis", 24, colors.title, true);
  y += 8;

  if (mainTitle) {
    addText(`Main Article: ${mainTitle}`, 12, colors.subheading);
  }
  y += 4;
  addText(
    `Comparing ${comparisonsList.length} related article${comparisonsList.length !== 1 ? "s" : ""}`,
    11,
    colors.muted,
  );
  y += 16;

  // Summary Stats
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 16;

  addText("Summary Statistics", 14, colors.heading, true);
  y += 8;

  addText(
    `• Total articles compared: ${comparisonsList.length}`,
    10,
    colors.text,
    false,
    8,
  );
  addText(`• Related articles: ${relatedCount}`, 10, colors.emerald, false, 8);
  if (unrelatedCount > 0) {
    addText(
      `• Unrelated articles: ${unrelatedCount} (may not be relevant)`,
      10,
      colors.red,
      false,
      8,
    );
  }

  const mainStronger = comparisonsList.filter(
    (c) => c.overallVerdict?.strongerPaper === "main",
  ).length;
  const relatedStronger = comparisonsList.filter(
    (c) => c.overallVerdict?.strongerPaper === "related",
  ).length;
  const comparable = comparisonsList.filter(
    (c) => c.overallVerdict?.strongerPaper === "comparable",
  ).length;

  y += 4;
  addText(
    `• Main article stronger in: ${mainStronger} comparison${mainStronger !== 1 ? "s" : ""}`,
    10,
    colors.text,
    false,
    8,
  );
  addText(
    `• Related article stronger in: ${relatedStronger} comparison${relatedStronger !== 1 ? "s" : ""}`,
    10,
    colors.text,
    false,
    8,
  );
  addText(
    `• Comparable: ${comparable} comparison${comparable !== 1 ? "s" : ""}`,
    10,
    colors.text,
    false,
    8,
  );

  y += 20;
  pdf.line(margin, y, pageWidth - margin, y);
  y += 20;

  // Individual Comparisons
  for (let i = 0; i < comparisonsList.length; i++) {
    const comparison = comparisonsList[i];

    // Start each comparison on a new page (except first if there's room)
    if (i > 0) {
      pdf.addPage();
      y = margin;
    }

    // Comparison Header
    addText(
      `Comparison ${i + 1}: ${comparison.relatedTitle}`,
      16,
      colors.title,
      true,
    );
    y += 4;

    // Relatedness indicator
    if (comparison.isRelated) {
      addText(
        `Relatedness Score: ${comparison.relatednessScore}/5 - Papers are related`,
        10,
        colors.emerald,
        true,
      );
    } else {
      addText(
        `⚠ UNRELATED: This paper may not be relevant`,
        10,
        colors.red,
        true,
      );
      y += 2;
      addText(comparison.relatednessExplanation, 9, colors.text, false, 8);
    }
    y += 12;

    // Summary
    addText("Summary", 12, colors.heading, true);
    y += 4;
    addText(comparison.summary, 10, colors.text);
    y += 12;

    // Overall Verdict
    if (comparison.overallVerdict) {
      checkPageBreak(60);
      addText("Overall Verdict", 12, colors.heading, true);
      y += 4;
      const verdictText =
        comparison.overallVerdict.strongerPaper === "main"
          ? `Main Article is Stronger`
          : comparison.overallVerdict.strongerPaper === "related"
            ? `${comparison.relatedTitle} is Stronger`
            : "Papers are Comparable";
      const verdictColor =
        comparison.overallVerdict.strongerPaper === "main"
          ? colors.emerald
          : comparison.overallVerdict.strongerPaper === "related"
            ? colors.blue
            : colors.purple;
      addText(verdictText, 11, verdictColor, true, 8);
      addText(comparison.overallVerdict.explanation, 10, colors.text, false, 8);
      y += 12;
    }

    // Dimensions
    if (comparison.dimensions && comparison.dimensions.length > 0) {
      checkPageBreak(40);
      addText("Comparison Dimensions", 12, colors.heading, true);
      y += 8;

      for (const dim of comparison.dimensions) {
        checkPageBreak(80);

        // Dimension header with verdict
        const verdictLabel =
          dim.verdict === "main_stronger"
            ? "[Main ▲]"
            : dim.verdict === "related_stronger"
              ? "[Related ▲]"
              : dim.verdict === "comparable"
                ? "[Equal]"
                : "[N/A]";
        const verdictColor =
          dim.verdict === "main_stronger"
            ? colors.emerald
            : dim.verdict === "related_stronger"
              ? colors.blue
              : colors.purple;

        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(colors.subheading);
        pdf.text(dim.label, margin + 8, y);
        pdf.setTextColor(verdictColor);
        pdf.text(
          ` ${verdictLabel}`,
          margin + 8 + pdf.getTextWidth(dim.label),
          y,
        );

        if (dim.mainScore && dim.relatedScore) {
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(colors.muted);
          pdf.setFontSize(8);
          pdf.text(
            ` (Main: ${dim.mainScore}/5, Related: ${dim.relatedScore}/5)`,
            margin +
              8 +
              pdf.getTextWidth(dim.label) +
              pdf.getTextWidth(` ${verdictLabel}`),
            y,
          );
        }
        y += 14;

        // Main summary
        addText("Main: ", 9, colors.emerald, true, 16);
        y -= 9 * 1.4; // Go back to same line
        pdf.setFont("helvetica", "normal");
        const mainLines = pdf.splitTextToSize(
          dim.mainSummary ?? "N/A",
          contentWidth - 50,
        );
        pdf.text(
          mainLines[0] ?? "",
          margin + 16 + pdf.getTextWidth("Main: "),
          y,
        );
        y += 9 * 1.4;
        for (let j = 1; j < mainLines.length; j++) {
          pdf.text(mainLines[j], margin + 16, y);
          y += 9 * 1.4;
        }

        // Related summary
        addText("Related: ", 9, colors.blue, true, 16);
        y -= 9 * 1.4;
        pdf.setFont("helvetica", "normal");
        const relLines = pdf.splitTextToSize(
          dim.relatedSummary ?? "N/A",
          contentWidth - 60,
        );
        pdf.text(
          relLines[0] ?? "",
          margin + 16 + pdf.getTextWidth("Related: "),
          y,
        );
        y += 9 * 1.4;
        for (let j = 1; j < relLines.length; j++) {
          pdf.text(relLines[j], margin + 16, y);
          y += 9 * 1.4;
        }
        y += 6;
      }
      y += 8;
    }

    // Similarities
    if (comparison.similarities && comparison.similarities.length > 0) {
      checkPageBreak(40);
      addText(
        `Similarities (${comparison.similarities.length})`,
        12,
        colors.heading,
        true,
      );
      y += 4;
      for (const s of comparison.similarities) {
        checkPageBreak(20);
        const confLabel =
          s.confidence === "high" ? "H" : s.confidence === "medium" ? "M" : "L";
        addText(`• [${confLabel}] ${s.claim}`, 9, colors.text, false, 8);
      }
      y += 8;
    }

    // Differences
    if (comparison.differences && comparison.differences.length > 0) {
      checkPageBreak(40);
      addText(
        `Differences (${comparison.differences.length})`,
        12,
        colors.heading,
        true,
      );
      y += 4;
      for (const d of comparison.differences) {
        checkPageBreak(20);
        const favorLabel =
          d.favoredPaper === "main"
            ? "→Main"
            : d.favoredPaper === "related"
              ? "→Rel"
              : "—";
        addText(`• [${favorLabel}] ${d.claim}`, 9, colors.text, false, 8);
      }
      y += 8;
    }

    // Gap Analysis
    if (comparison.gapAnalysis) {
      checkPageBreak(60);
      addText("Gap Analysis", 12, colors.heading, true);
      y += 4;

      if (comparison.gapAnalysis.uniqueToMain?.length > 0) {
        addText("Unique to Main Article:", 10, colors.emerald, true, 8);
        for (const g of comparison.gapAnalysis.uniqueToMain) {
          addText(`• ${g}`, 9, colors.text, false, 16);
        }
      }

      if (comparison.gapAnalysis.uniqueToRelated?.length > 0) {
        addText("Unique to Related Article:", 10, colors.blue, true, 8);
        for (const g of comparison.gapAnalysis.uniqueToRelated) {
          addText(`• ${g}`, 9, colors.text, false, 16);
        }
      }

      if (comparison.gapAnalysis.sharedGaps?.length > 0) {
        addText("Shared Gaps:", 10, colors.muted, true, 8);
        for (const g of comparison.gapAnalysis.sharedGaps) {
          addText(`• ${g}`, 9, colors.text, false, 16);
        }
      }
      y += 8;
    }

    // Contradictions
    if (comparison.contradictions && comparison.contradictions.length > 0) {
      checkPageBreak(60);
      addText(
        `Contradictions (${comparison.contradictions.length})`,
        12,
        colors.red,
        true,
      );
      y += 4;
      for (const c of comparison.contradictions) {
        checkPageBreak(50);
        addText(c.topic, 10, colors.subheading, true, 8);
        addText(`Main position: ${c.mainPosition}`, 9, colors.text, false, 16);
        addText(
          `Related position: ${c.relatedPosition}`,
          9,
          colors.text,
          false,
          16,
        );
        addText(
          `Explanation: ${c.possibleExplanation}`,
          9,
          colors.muted,
          false,
          16,
        );
        y += 4;
      }
      y += 8;
    }

    // Methodological Rigor
    if (comparison.methodologicalRigor) {
      checkPageBreak(80);
      addText("Methodological Rigor", 12, colors.heading, true);
      y += 4;

      const rigorItems = [
        {
          label: "Sample Size Adequacy",
          data: comparison.methodologicalRigor.sampleSizeAdequacy,
        },
        {
          label: "Bias Controls",
          data: comparison.methodologicalRigor.biasControls,
        },
        {
          label: "Statistical Rigor",
          data: comparison.methodologicalRigor.statisticalRigor,
        },
        {
          label: "Replicability",
          data: comparison.methodologicalRigor.replicability,
        },
      ];

      for (const item of rigorItems) {
        if (!item.data) continue; // Skip if data is missing
        checkPageBreak(40);
        const verdictText =
          item.data.verdict === "main_stronger"
            ? "[Main ▲]"
            : item.data.verdict === "related_stronger"
              ? "[Related ▲]"
              : "[Equal]";
        addText(`${item.label} ${verdictText}`, 10, colors.subheading, true, 8);
        addText(`Main: ${item.data.main ?? "N/A"}`, 9, colors.text, false, 16);
        addText(
          `Related: ${item.data.related ?? "N/A"}`,
          9,
          colors.text,
          false,
          16,
        );
        y += 2;
      }
      y += 8;
    }

    // Temporal Context
    if (comparison.temporalContext) {
      checkPageBreak(60);
      addText("Temporal Context", 12, colors.heading, true);
      y += 4;
      addText(
        `Chronology: ${comparison.temporalContext.chronologicalNote ?? "N/A"}`,
        9,
        colors.text,
        false,
        8,
      );
      addText(
        `Method Evolution: ${comparison.temporalContext.methodologicalEvolution ?? "N/A"}`,
        9,
        colors.text,
        false,
        8,
      );
      addText(
        `Findings Progression: ${comparison.temporalContext.findingsProgression ?? "N/A"}`,
        9,
        colors.text,
        false,
        8,
      );
      y += 8;
    }

    // Recommendations
    if (comparison.recommendations) {
      checkPageBreak(80);
      addText("Recommendations", 12, colors.heading, true);
      y += 4;

      if (comparison.recommendations.forResearchers?.length > 0) {
        addText("For Researchers:", 10, colors.subheading, true, 8);
        for (const r of comparison.recommendations.forResearchers) {
          addText(`• ${r}`, 9, colors.text, false, 16);
        }
      }

      if (comparison.recommendations.forPractitioners?.length > 0) {
        addText("For Practitioners:", 10, colors.subheading, true, 8);
        for (const r of comparison.recommendations.forPractitioners) {
          addText(`• ${r}`, 9, colors.text, false, 16);
        }
      }

      if (comparison.recommendations.synthesizedConclusion) {
        y += 4;
        addText("Synthesized Conclusion:", 10, colors.subheading, true, 8);
        addText(
          comparison.recommendations.synthesizedConclusion,
          9,
          colors.text,
          false,
          8,
        );
      }
    }
  }

  // Footer on all pages
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(colors.muted);
    pdf.text(
      `Page ${i} of ${totalPages} • Generated by RUI`,
      pageWidth / 2,
      pageHeight - 20,
      { align: "center" },
    );
  }

  pdf.save(fileName ?? "pairwise-comparative-analysis.pdf");
}
