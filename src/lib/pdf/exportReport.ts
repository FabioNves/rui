"use client";

export async function exportElementToPdf(
  element: HTMLElement,
  fileName: string,
) {
  if (typeof window === "undefined") {
    throw new Error("PDF export is only available in the browser");
  }

  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // Create a clone of the element to avoid modifying the original
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.position = "absolute";
  clone.style.left = "-9999px";
  clone.style.top = "0";
  clone.style.width = `${element.offsetWidth}px`;
  document.body.appendChild(clone);

  // Apply inline styles to override any oklab colors
  const allElements = clone.querySelectorAll("*");
  allElements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    const computed = window.getComputedStyle(htmlEl);
    // Set explicit colors to avoid oklab parsing issues
    if (computed.color) {
      htmlEl.style.color = computed.color;
    }
    if (
      computed.backgroundColor &&
      computed.backgroundColor !== "rgba(0, 0, 0, 0)"
    ) {
      htmlEl.style.backgroundColor = computed.backgroundColor;
    }
    if (computed.borderColor) {
      htmlEl.style.borderColor = computed.borderColor;
    }
  });

  // Set a white background for PDF readability
  clone.style.backgroundColor = "#ffffff";
  clone.style.color = "#000000";
  clone.style.padding = "20px";

  // Make text dark for PDF
  const textElements = clone.querySelectorAll(
    "p, span, h1, h2, h3, h4, h5, h6, li, td, th, div",
  );
  textElements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    const computed = window.getComputedStyle(el);
    // If text is light (for dark mode), make it dark for PDF
    const color = computed.color;
    if (color.includes("rgb")) {
      const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        const [, r, g, b] = match.map(Number);
        // If color is light (high values), make it dark
        if (r > 150 && g > 150 && b > 150) {
          htmlEl.style.color = "#1f2937";
        }
      }
    }
  });

  try {
    const canvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      removeContainer: false,
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF({
      orientation: "p",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let y = 0;
    while (y < imgHeight) {
      pdf.addImage(imgData, "PNG", 0, -y, imgWidth, imgHeight);
      y += pageHeight;
      if (y < imgHeight) pdf.addPage();
    }

    pdf.save(fileName);
  } finally {
    // Clean up the clone
    document.body.removeChild(clone);
  }
}
