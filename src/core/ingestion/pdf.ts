/*
 * Filename: pdf.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { readFileSync } from "node:fs";
import * as mupdf from "mupdf";
import { AppError } from "../contracts/errors.js";
import { reflowParagraphs } from "./text.js";
import type { ExtractionResult, ProgressCallback, Segment } from "./types.js";

export const MIN_PAGE_CHARS = 20;
export const OCR_UNAVAILABLE_MESSAGE =
  "Nenhum texto foi encontrado: o PDF parece escaneado e o OCR não está disponível.";

/** Reads a page as an image and returns its text and mean confidence (0 to 100). */
export interface OcrPage {
  text: string;
  confidence: number;
}

export interface OcrEngine {
  available(): boolean;
  recognize(png: Uint8Array): Promise<OcrPage>;
}

export interface PdfHooks {
  progress?: ProgressCallback;
  checkCancelled?: () => void;
  ocr?: OcrEngine;
  minChars?: number;
}

function open(path: string): mupdf.Document {
  try {
    const document = mupdf.Document.openDocument(readFileSync(path), "application/pdf");
    return document;
  } catch {
    throw new AppError("EXTRACTION_FAILED", "O PDF está corrompido ou não pôde ser aberto.");
  }
}

/** Extracts the text of every page, reading scanned pages through OCR when an engine exists. */
export async function extractPdf(path: string, hooks: PdfHooks = {}): Promise<ExtractionResult> {
  const minChars = hooks.minChars ?? MIN_PAGE_CHARS;
  const document = open(path);
  try {
    if (document.needsPassword()) {
      throw new AppError("EXTRACTION_FAILED", "O PDF está protegido por senha.");
    }
    const canOcr = hooks.ocr?.available() ?? false;
    const segments: Segment[] = [];
    const confidences: number[] = [];
    let blankPages = 0;
    const total = document.countPages();
    for (let number = 1; number <= total; number += 1) {
      hooks.checkCancelled?.();
      const page = document.loadPage(number - 1);
      let text = reflowParagraphs(page.toStructuredText("preserve-whitespace").asText());
      if (text.length < minChars && hooks.ocr && canOcr) {
        const png = page
          .toPixmap(mupdf.Matrix.scale(200 / 72, 200 / 72), mupdf.ColorSpace.DeviceRGB, false, true)
          .asPNG();
        const recognized = await hooks.ocr.recognize(png);
        text = reflowParagraphs(recognized.text);
        if (text) confidences.push(recognized.confidence);
      } else if (text.length < minChars) {
        blankPages += 1;
      }
      if (text) segments.push({ text, page: number });
      hooks.progress?.(number / total, `página ${number} de ${total}`);
    }
    if (segments.length === 0) {
      if (!canOcr) throw new AppError("OCR_UNAVAILABLE", OCR_UNAVAILABLE_MESSAGE);
      throw new AppError("EXTRACTION_FAILED", "O OCR não reconheceu nenhum texto neste PDF.");
    }
    const warnings =
      blankPages > 0
        ? [`${blankPages} página(s) sem texto foram ignoradas (OCR indisponível).`]
        : [];
    const confidence =
      confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;
    return { segments, pageCount: total, ocrConfidence: confidence, warnings, title: null };
  } finally {
    document.destroy();
  }
}
