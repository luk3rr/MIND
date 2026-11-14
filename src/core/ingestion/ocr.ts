/*
 * Filename: ocr.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createWorker } from "tesseract.js";
import type { OcrEngine, OcrPage } from "./pdf.js";

const LANGUAGES = ["por", "eng"] as const;
const DATA_VERSION = "4.0.0_best_int";

/** Copies the bundled language data into one folder, as Tesseract expects, if it is not there yet. */
export function ensureTessdata(target: string): string {
  const require = createRequire(import.meta.url);
  mkdirSync(target, { recursive: true });
  for (const language of LANGUAGES) {
    const file = `${language}.traineddata.gz`;
    const destination = join(target, file);
    if (existsSync(destination)) continue;
    const packageJson = require.resolve(`@tesseract.js-data/${language}/package.json`);
    copyFileSync(join(dirname(packageJson), DATA_VERSION, file), destination);
  }
  return target;
}

type Worker = Awaited<ReturnType<typeof createWorker>>;

/** OCR with the bundled Tesseract (WASM): no installation and no network (T-7). */
export class TesseractOcr implements OcrEngine {
  private worker: Promise<Worker> | null = null;
  private broken = false;

  constructor(private readonly tessdataDir: string) {}

  available(): boolean {
    return !this.broken;
  }

  private start(): Promise<Worker> {
    this.worker ??= (async () => {
      try {
        ensureTessdata(this.tessdataDir);
        return await createWorker([...LANGUAGES], 1, {
          langPath: this.tessdataDir,
          gzip: true,
          cacheMethod: "none",
        });
      } catch (error) {
        this.broken = true;
        throw error;
      }
    })();
    return this.worker;
  }

  async recognize(png: Uint8Array): Promise<OcrPage> {
    const worker = await this.start();
    const { data } = await worker.recognize(Buffer.from(png));
    return { text: data.text, confidence: data.confidence };
  }

  async terminate(): Promise<void> {
    if (!this.worker) return;
    const worker = await this.worker.catch(() => null);
    await worker?.terminate();
    this.worker = null;
  }
}
