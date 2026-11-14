/*
 * Filename: secrets.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AppError } from "./contracts/errors.js";

export const ENV_NAME = "OPENROUTER_API_KEY";
export type KeySource = "environment" | "stored";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function writePrivate(path: string, data: Buffer): void {
  const temp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  writeFileSync(temp, data, { mode: 0o600 });
  chmodSync(temp, 0o600);
  renameSync(temp, path);
}

/**
 * Stores the provider API key encrypted at rest with a locally generated AES-256-GCM key.
 * The key file and the credentials file are separate and both private (0600). The environment
 * variable wins over the stored key. The key is never sent to the window or written to a log.
 */
export class SecretStore {
  private readonly keyFile: string;
  private readonly credentialsFile: string;

  constructor(
    private readonly dir: string,
    private readonly env: Record<string, string | undefined> = process.env,
  ) {
    this.keyFile = join(dir, "keystore.key");
    this.credentialsFile = join(dir, "credentials.enc");
  }

  private loadOrCreateKey(): Buffer {
    if (existsSync(this.keyFile)) return readFileSync(this.keyFile);
    mkdirSync(this.dir, { recursive: true });
    const key = randomBytes(32);
    writePrivate(this.keyFile, key);
    return key;
  }

  private read(): Record<string, string> {
    if (!existsSync(this.credentialsFile)) return {};
    try {
      const data = readFileSync(this.credentialsFile);
      const decipher = createDecipheriv(
        ALGORITHM,
        this.loadOrCreateKey(),
        data.subarray(0, IV_BYTES),
      );
      decipher.setAuthTag(data.subarray(data.length - TAG_BYTES));
      const plain = Buffer.concat([
        decipher.update(data.subarray(IV_BYTES, data.length - TAG_BYTES)),
        decipher.final(),
      ]);
      return JSON.parse(plain.toString("utf8")) as Record<string, string>;
    } catch {
      // A damaged or unreadable file behaves as "no key stored".
      return {};
    }
  }

  private write(values: Record<string, string>): void {
    mkdirSync(this.dir, { recursive: true });
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.loadOrCreateKey(), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
    writePrivate(this.credentialsFile, Buffer.concat([iv, body, cipher.getAuthTag()]));
  }

  /** The key for the provider client. Only the LLM layer may call this. */
  apiKey(): string | null {
    const fromEnv = this.env[ENV_NAME];
    if (fromEnv) return fromEnv;
    return this.read()[ENV_NAME] ?? null;
  }

  isConfigured(): boolean {
    return this.apiKey() !== null;
  }

  source(): KeySource | null {
    if (this.env[ENV_NAME]) return "environment";
    return this.read()[ENV_NAME] ? "stored" : null;
  }

  save(key: string): void {
    const cleaned = key.trim();
    if (!cleaned || /\s/.test(cleaned)) {
      throw new AppError(
        "VALIDATION_ERROR",
        "A chave de API não pode ser vazia nem conter espaços.",
        [{ field: "apiKey", message: "Informe uma chave sem espaços." }],
      );
    }
    this.write({ ...this.read(), [ENV_NAME]: cleaned });
  }

  clear(): void {
    if (!existsSync(this.credentialsFile)) return;
    const values = new Map(Object.entries(this.read()));
    values.delete(ENV_NAME);
    this.write(Object.fromEntries(values));
  }
}
