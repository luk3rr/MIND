/*
 * Filename: provider.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { ProviderState } from "../test/fake-mind.js";
import { App } from "./App.js";
import { parseLimit } from "./components/ProviderForm.js";
import { parseRoute } from "./router.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

async function open(route: string | null, provider: ProviderState | undefined) {
  const fake = installFakeMind({
    workspaces: [ws],
    route,
    ...(provider ? { provider } : {}),
  });
  render(<App />);
  return fake;
}

const base: ProviderState = {
  apiKey: null,
  keySource: null,
  consentGiven: false,
  generationModel: "a/gen",
  judgeModel: "b/judge",
  monthlyLimitUsd: 5,
  spentThisMonth: 0,
  knownModels: ["a/gen", "b/judge"],
  lines: [],
  refreshWorks: true,
};

describe("parseLimit and setup routes", () => {
  it("accepts dot and comma decimals and rejects the rest", () => {
    expect(parseLimit("5")).toBe(5);
    expect(parseLimit(" 7,5 ")).toBe(7.5);
    expect(parseLimit("12.25")).toBe(12.25);
    for (const text of ["", "abc", "-1", "1.2.3", "1e3"]) expect(parseLimit(text)).toBeNaN();
  });

  it("parses the two setup steps", () => {
    expect(parseRoute("/setup/1")).toEqual({ name: "setup", step: 1 });
    expect(parseRoute("/setup/2")).toEqual({ name: "setup", step: 2 });
    expect(parseRoute("/setup/3")).toEqual({ name: "unknown" });
  });
});

describe("setup banner", () => {
  it("shows while the key or the consent is missing and leads to the setup", async () => {
    await open("/w/1/today", { ...base });
    const banner = await screen.findByText(/Configure o provedor de IA/);
    expect(banner).toBeVisible();
    await userEvent
      .setup()
      .click(
        within(banner.closest("p") as HTMLElement).getByRole("button", { name: "Configurar" }),
      );
    expect(await screen.findByText("Passo 1 de 2: chave e modelos")).toBeVisible();
  });

  it("is hidden once both the key and the consent exist", async () => {
    await open("/w/1/today", {
      ...base,
      apiKey: "sk-or-x",
      keySource: "stored",
      consentGiven: true,
    });
    await screen.findByRole("heading", { name: "Hoje" });
    await waitFor(() => expect(screen.queryByText(/Configure o provedor de IA/)).toBeNull());
  });
});

/** Opens the first step of the setup through the banner, as a user does. */
async function openSetup(provider: ProviderState | undefined) {
  const fake = await open("/w/1/today", provider);
  await userEvent.setup().click(await screen.findByRole("button", { name: "Configurar" }));
  await screen.findByText("Passo 1 de 2: chave e modelos");
  return fake;
}

describe("setup wizard", () => {
  it("saves the key and models, then asks for the consent and finishes", async () => {
    const fake = await openSetup({ ...base });
    const user = userEvent.setup();
    expect(screen.getByText("Nenhuma chave configurada.")).toBeVisible();
    await user.type(screen.getByLabelText("Chave de API do OpenRouter"), "sk-or-v1-new");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByText("Passo 2 de 2: privacidade")).toBeVisible();
    expect(fake.state.provider.apiKey).toBe("sk-or-v1-new");
    expect(screen.getByText(/O arquivo inteiro nunca é enviado/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Aceito" }));
    expect(await screen.findByRole("heading", { name: "Hoje" })).toBeVisible();
    expect(fake.state.provider.consentGiven).toBe(true);
  });

  it("shows field errors and does not advance", async () => {
    await openSetup({ ...base });
    const user = userEvent.setup();
    const model = screen.getByLabelText("Modelo para gerar");
    await user.clear(model);
    await user.type(model, "bad model!");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Informe o identificador do modelo.",
    );
    expect(screen.queryByText("Passo 2 de 2: privacidade")).toBeNull();
  });

  it("rejects a monthly limit that is not a positive number", async () => {
    await openSetup({ ...base });
    const user = userEvent.setup();
    const limit = screen.getByLabelText("Limite mensal de custo (US$)");
    await user.clear(limit);
    await user.type(limit, "abc");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Informe um valor maior que zero.");
  });
});

describe("Settings page", () => {
  it("shows the status without ever showing the key, and saves new values", async () => {
    const fake = await open("/w/1/settings", {
      ...base,
      apiKey: "sk-or-secret",
      keySource: "stored",
      consentGiven: true,
    });
    const user = userEvent.setup();
    expect(
      await screen.findByText("Chave configurada (guardada cifrada neste computador)."),
    ).toBeVisible();
    expect(document.body.innerHTML).not.toContain("sk-or-secret");
    const limit = screen.getByLabelText("Limite mensal de custo (US$)");
    await user.clear(limit);
    await user.type(limit, "7,5");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByText("Configurações salvas.")).toBeVisible();
    expect(fake.state.provider.monthlyLimitUsd).toBe(7.5);
    expect(fake.state.provider.apiKey).toBe("sk-or-secret");
  });

  it("removes a stored key and revokes or gives the consent", async () => {
    const fake = await open("/w/1/settings", {
      ...base,
      apiKey: "sk-or-x",
      keySource: "stored",
      consentGiven: true,
    });
    const user = userEvent.setup();
    expect(await screen.findByText("Envio de trechos aceito.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Revogar aceite" }));
    expect(await screen.findByText("Envio de trechos ainda não aceito.")).toBeVisible();
    expect(fake.state.provider.consentGiven).toBe(false);
    await user.click(screen.getByRole("button", { name: "Aceito" }));
    expect(await screen.findByText("Envio de trechos aceito.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remover chave" }));
    expect(await screen.findByText("Nenhuma chave configurada.")).toBeVisible();
    expect(fake.state.provider.apiKey).toBeNull();
  });

  it("does not offer to remove a key that comes from the environment", async () => {
    await open("/w/1/settings", {
      ...base,
      apiKey: "sk-or-env",
      keySource: "environment",
      consentGiven: true,
    });
    expect(await screen.findByText("Chave configurada (variável de ambiente).")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remover chave" })).toBeNull();
  });

  it("reports the result of refreshing the model catalog", async () => {
    const fake = await open("/w/1/settings", {
      ...base,
      apiKey: "k",
      keySource: "stored",
      consentGiven: true,
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Atualizar catálogo de modelos" }));
    expect(await screen.findByText("Catálogo de modelos atualizado.")).toBeVisible();
    fake.state.provider.refreshWorks = false;
    await user.click(screen.getByRole("button", { name: "Atualizar catálogo de modelos" }));
    expect(await screen.findByText("Não foi possível atualizar o catálogo agora.")).toBeVisible();
  });

  it("shows the monthly spend and the calls of the month", async () => {
    await open("/w/1/settings", {
      ...base,
      apiKey: "k",
      keySource: "stored",
      consentGiven: true,
      spentThisMonth: 1.2345,
      lines: [
        {
          at: "2026-03-10T10:00:00.000Z",
          provider: "openrouter",
          model: "a/gen",
          purpose: "generation",
          promptTokens: 10,
          completionTokens: 5,
          costUsd: 0.0123,
        },
      ],
    });
    expect(await screen.findByText("US$ 1.23")).toBeVisible();
    expect(await screen.findByText("0.0123")).toBeVisible();
    expect(screen.getByText("a/gen", { selector: "td" })).toBeVisible();
  });

  it("says when there were no calls this month", async () => {
    await open("/w/1/settings", { ...base, apiKey: "k", keySource: "stored", consentGiven: true });
    expect(await screen.findByText("Nenhuma chamada neste mês.")).toBeVisible();
  });
});
