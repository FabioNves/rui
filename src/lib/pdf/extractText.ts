"use client";

export type ExtractedImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export type ExtractedPage = {
  pageNumber: number;
  text: string;
  images: ExtractedImage[];
};

export type ExtractedPdfData = {
  pages: ExtractedPage[];
  fullText: string;
};

type PdfTextItem = { str: string };
type PdfOperatorList = {
  fnArray: number[];
  argsArray: unknown[][];
};
type PdfObjs = {
  get: (name: string) => unknown;
};
type PdfPage = {
  getTextContent: () => Promise<{ items: unknown[] }>;
  getOperatorList: () => Promise<PdfOperatorList>;
  objs: PdfObjs;
  commonObjs: PdfObjs;
};
type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

// PDF.js operator codes for images
const OPS_PAINT_IMAGE_XOBJECT = 85;
const OPS_PAINT_IMAGE_XOBJECT_REPEAT = 86;
const OPS_PAINT_JPEG_XOBJECT = 82;

async function initPdfjs() {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  (
    pdfjsLib as unknown as { GlobalWorkerOptions: { workerSrc: string } }
  ).GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
  return pdfjsLib as unknown as {
    getDocument: (arg: unknown) => { promise: Promise<unknown> };
    OPS: Record<string, number>;
  };
}

function imageDataToDataUrl(imageData: {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const imgData = ctx.createImageData(imageData.width, imageData.height);
  imgData.data.set(imageData.data);
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

async function extractImagesFromPage(page: PdfPage): Promise<ExtractedImage[]> {
  const images: ExtractedImage[] = [];

  try {
    const operatorList = await page.getOperatorList();
    const seenImages = new Set<string>();

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];

      if (
        fn === OPS_PAINT_IMAGE_XOBJECT ||
        fn === OPS_PAINT_IMAGE_XOBJECT_REPEAT ||
        fn === OPS_PAINT_JPEG_XOBJECT
      ) {
        const args = operatorList.argsArray[i];
        const imageName = args?.[0] as string | undefined;

        if (!imageName || seenImages.has(imageName)) continue;
        seenImages.add(imageName);

        try {
          // Try to get the image from page objects
          let imgData = page.objs.get(imageName) as {
            data?: Uint8ClampedArray;
            width?: number;
            height?: number;
          } | null;

          if (!imgData) {
            imgData = page.commonObjs.get(imageName) as typeof imgData;
          }

          if (imgData?.data && imgData.width && imgData.height) {
            // Skip very small images (likely icons/bullets)
            if (imgData.width < 50 || imgData.height < 50) continue;

            const dataUrl = imageDataToDataUrl({
              data: imgData.data,
              width: imgData.width,
              height: imgData.height,
            });

            if (dataUrl) {
              images.push({
                dataUrl,
                width: imgData.width,
                height: imgData.height,
              });
            }
          }
        } catch {
          // Image extraction failed for this image, continue
        }
      }
    }
  } catch {
    // Operator list extraction failed, return empty
  }

  return images;
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const result = await extractPdfWithPages(file);
  return result.fullText;
}

export async function extractPdfWithPages(
  file: File,
): Promise<ExtractedPdfData> {
  if (typeof window === "undefined") {
    throw new Error("PDF extraction is only available in the browser");
  }

  const pdfjsLib = await initPdfjs();

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjsLib.getDocument({ data });
  const pdf = (await task.promise) as PdfDocument;

  const pages: ExtractedPage[] = [];
  let fullText = "";

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);

    // Extract text
    const content = await page.getTextContent();
    const strings = content.items
      .map((it) => {
        if (it && typeof it === "object") {
          const str = (it as Partial<PdfTextItem>).str;
          return typeof str === "string" ? str : "";
        }
        return "";
      })
      .filter(Boolean);
    const pageText = strings.join(" ");

    // Extract images
    const images = await extractImagesFromPage(page);

    pages.push({
      pageNumber: pageNum,
      text: pageText,
      images,
    });

    fullText += pageText + "\n\n";
  }

  return {
    pages,
    fullText: fullText.trim(),
  };
}
