/*
 * Filename: connection.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { SecretStore } from "../secrets.js";
import { BASE_URL } from "./openrouter.js";
import type { FetchLike } from "./openrouter.js";

export interface ConnectionResult {
  ok: boolean;
  message: string;
}

/**
 * Asks OpenRouter who the key belongs to. Only the key is sent: no material and no excerpt, so it
 * needs no consent. Never throws; the answer says what went wrong in Portuguese.
 */
export async function testConnection(
  secrets: SecretStore,
  fetchImpl: FetchLike,
  baseUrl: string = BASE_URL,
): Promise<ConnectionResult> {
  const key = secrets.apiKey();
  if (!key) return { ok: false, message: "Nenhuma chave configurada." };
  try {
    const response = await fetchImpl(`${baseUrl}/auth/key`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.ok) return { ok: true, message: "Conexão com o OpenRouter funcionando." };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: "O OpenRouter recusou a chave. Confira se ela está correta." };
    }
    return { ok: false, message: `O OpenRouter respondeu com o erro ${response.status}.` };
  } catch {
    return { ok: false, message: "Não foi possível falar com o OpenRouter. Verifique a rede." };
  }
}
