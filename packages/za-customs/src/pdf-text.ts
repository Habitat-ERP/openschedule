import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { hashFileSha256 } from "@openschedule/core";

const require = createRequire(import.meta.url);
const standardFontDataUrl = join(dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts/");

export interface CustomsPdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
  hasEol?: boolean;
}

export interface CustomsPdfTextPage {
  pageNumber: number;
  width: number;
  height: number;
  rotation: number;
  items: CustomsPdfTextItem[];
}

export interface ExtractCustomsPdfTextItemsOptions {
  pdfPath: string;
  pages?: readonly number[];
}

export interface CustomsPdfTextExtraction {
  pdfPath: string;
  sourceDocumentSha256: string;
  totalPages: number;
  pages: CustomsPdfTextPage[];
}

interface PdfJsTextItem {
  str: string;
  dir: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}

function isPdfJsTextItem(item: unknown): item is PdfJsTextItem {
  return typeof item === "object" && item !== null && "str" in item && "transform" in item;
}

export async function extractCustomsPdfTextItems(
  options: ExtractCustomsPdfTextItemsOptions
): Promise<CustomsPdfTextExtraction> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const [dataBuffer, sourceDocumentSha256] = await Promise.all([
    readFile(options.pdfPath),
    hashFileSha256(options.pdfPath)
  ]);
  const loadingTask = getDocument({
    data: new Uint8Array(dataBuffer),
    disableFontFace: true,
    standardFontDataUrl,
    useWorkerFetch: false
  });

  try {
    const document = await loadingTask.promise;
    const pageNumbers = options.pages ?? Array.from({ length: document.numPages }, (_, index) => index + 1);
    const pages: CustomsPdfTextPage[] = [];

    for (const pageNumber of pageNumbers) {
      if (pageNumber < 1 || pageNumber > document.numPages) {
        throw new Error(`Page ${pageNumber} is outside PDF page range 1-${document.numPages}`);
      }

      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent({ disableNormalization: false });
      const [x1, y1, x2, y2] = page.view;
      const items = textContent.items.filter((item): item is PdfJsTextItem => isPdfJsTextItem(item));
      pages.push({
        pageNumber,
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        rotation: page.rotate,
        items: items.map((item) => ({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
          fontName: item.fontName,
          hasEol: item.hasEOL
        }))
      });
      page.cleanup();
    }

    return {
      pdfPath: options.pdfPath,
      sourceDocumentSha256,
      totalPages: document.numPages,
      pages
    };
  } finally {
    await loadingTask.destroy();
  }
}
