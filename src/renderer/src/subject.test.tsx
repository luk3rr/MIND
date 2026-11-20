/*
 * Filename: subject.test.tsx
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import type { FakeMaterial, FakeState } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

type Analysis = NonNullable<FakeMaterial["analysis"]>;
const analysis = (overrides: Partial<Analysis> = {}): Analysis => ({
  state: "none",
  progress: null,
  errorCode: null,
  errorDetail: null,
  analyzedAt: null,
  ...overrides,
});
const SUBJECT = "Língua Portuguesa: ortografia e acentuação";

function material(overrides: Partial<FakeMaterial> = {}): FakeMaterial {
  return {
    id: 1,
    title: "Aula 3",
    kind: "pdf",
    filename: "aula3.pdf",
    status: "indexed",
    pageCount: 48,
    charCount: 1000,
    ocrConfidence: null,
    jobId: 1,
    errorCode: null,
    errorDetail: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    sourceUrl: null,
    progress: null,
    chunkCount: 34,
    ...overrides,
  };
}

function open(route: string, initial: Partial<FakeState> = {}) {
  const fake = installFakeMind({ workspaces: [ws], route, ...initial });
  render(<App />);
  return fake;
}

const inferred = (state: Analysis["state"] = "done"): Partial<FakeMaterial> => ({
  subject: { value: SUBJECT, source: "inferred", informed: null, inferred: SUBJECT },
  analysis: analysis({ state, analyzedAt: state === "done" ? "2026-11-19T10:00:00.000Z" : null }),
});

async function openSubjectDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Mais ações Aula 3" }));
  await user.click(await screen.findByRole("menuitem", { name: "Definir disciplina…" }));
  return screen.findByRole("dialog", { name: /Disciplina de/ });
}

describe("the library and the subject of a material (FR-14, FR-9)", () => {
  it("shows the subject under the name, unless it is only the title", async () => {
    open("/w/1/library", {
      materials: [
        material({ id: 1, title: "Aula 3", ...inferred() }),
        material({ id: 2, title: "Matemática", filename: "mat.pdf" }),
      ],
    });
    const table = await screen.findByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1] as HTMLElement).getByText(SUBJECT)).toBeVisible();
    expect(within(rows[2] as HTMLElement).queryByText(/Língua/)).toBeNull();
  });

  it.each([
    ["analyzing", { state: "analyzing", progress: 0.4 } as Partial<Analysis>, "Analisando 40%"],
    ["done", { state: "done", analyzedAt: "2026-11-19T10:00:00.000Z" }, "Analisado"],
    ["failed", { state: "failed", errorCode: "PROVIDER_ERROR" }, "Falha na análise"],
    [
      "paused",
      { state: "paused", errorCode: "MONTHLY_LIMIT_REACHED" },
      "Análise pausada: limite mensal",
    ],
  ] as [string, Partial<Analysis>, string][])(
    "shows the %s analysis next to the status",
    async (_name, state, text) => {
      open("/w/1/library", { materials: [material({ analysis: analysis(state) })] });
      expect(await screen.findByText(text)).toBeVisible();
    },
  );

  it("shows no analysis for a material that never had one", async () => {
    open("/w/1/library", { materials: [material()] });
    await screen.findByRole("table");
    expect(screen.queryByText(/Analis/)).toBeNull();
  });

  it("offers to analyze again only when the analysis failed or stopped", async () => {
    const fake = open("/w/1/library", {
      materials: [
        material({ analysis: analysis({ state: "failed", errorCode: "PROVIDER_ERROR" }) }),
      ],
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Mais ações Aula 3" }));
    await user.click(await screen.findByRole("menuitem", { name: "Analisar de novo" }));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith("material:analyze", { workspaceId: 1, id: 1 }),
    );
    // The analysis is running now, so the item is gone.
    await user.click(await screen.findByRole("button", { name: "Mais ações Aula 3" }));
    expect(screen.queryByRole("menuitem", { name: "Analisar de novo" })).toBeNull();
  });

  it("does not offer it for a material that is analyzed", async () => {
    open("/w/1/library", { materials: [material(inferred())] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Mais ações Aula 3" }));
    expect(screen.queryByRole("menuitem", { name: "Analisar de novo" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Definir disciplina…" })).toBeVisible();
  });
});

describe("the subject dialog (FR-14, FR-9, NFR-7)", () => {
  it("names the subject of the material, which then shows under its name", async () => {
    const fake = open("/w/1/library", { materials: [material(inferred())] });
    const user = userEvent.setup();
    const dialog = await openSubjectDialog(user);
    expect(within(dialog).getByText(SUBJECT)).toBeVisible();
    const field = within(dialog).getByLabelText("Disciplina ou assunto (opcional)");
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    await user.type(field, "Gramática{Enter}");
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith("material:setSubject", {
        workspaceId: 1,
        id: 1,
        subject: "Gramática",
      }),
    );
    expect(await screen.findByText("Gramática")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("starts with the subject already named, and clearing it goes back to the inferred one", async () => {
    const fake = open("/w/1/library", {
      materials: [
        material({
          subject: {
            value: "Gramática",
            source: "informed",
            informed: "Gramática",
            inferred: SUBJECT,
          },
          analysis: analysis({ state: "done", analyzedAt: "2026-11-19T10:00:00.000Z" }),
        }),
      ],
    });
    const user = userEvent.setup();
    const dialog = await openSubjectDialog(user);
    const field = within(dialog).getByLabelText("Disciplina ou assunto (opcional)");
    expect(field).toHaveValue("Gramática");
    await user.clear(field);
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith("material:setSubject", {
        workspaceId: 1,
        id: 1,
        subject: null,
      }),
    );
    expect(await screen.findByText(SUBJECT)).toBeVisible();
  });

  it("closes with Esc without saving", async () => {
    const fake = open("/w/1/library", { materials: [material(inferred())] });
    const user = userEvent.setup();
    await openSubjectDialog(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fake.invoke).not.toHaveBeenCalledWith("material:setSubject", expect.anything());
  });

  it("says the analysis is running, and has nothing to ask again", async () => {
    open("/w/1/library", {
      materials: [material({ analysis: analysis({ state: "analyzing", progress: 0.2 }) })],
    });
    const user = userEvent.setup();
    const dialog = await openSubjectDialog(user);
    expect(within(dialog).getByRole("status")).toHaveTextContent("Analisando o material…");
    expect(within(dialog).queryByRole("button", { name: "Analisar de novo" })).toBeNull();
  });

  it("says the subject was not identified, and can ask again", async () => {
    const fake = open("/w/1/library", {
      materials: [
        material({ analysis: analysis({ state: "done", analyzedAt: "2026-11-19T10:00:00.000Z" }) }),
      ],
    });
    const user = userEvent.setup();
    const dialog = await openSubjectDialog(user);
    expect(within(dialog).getByText("Não identificada")).toBeVisible();
    // An analysis that is done has nothing to repeat here.
    expect(within(dialog).queryByRole("button", { name: "Analisar de novo" })).toBeNull();
    expect(fake.invoke).not.toHaveBeenCalledWith("material:analyze", expect.anything());
  });

  it("asks again after a failure and shows what is running", async () => {
    const fake = open("/w/1/library", {
      materials: [
        material({ analysis: analysis({ state: "failed", errorCode: "PROVIDER_ERROR" }) }),
      ],
    });
    const user = userEvent.setup();
    const dialog = await openSubjectDialog(user);
    expect(within(dialog).getByText("Falha na análise")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Analisar de novo" }));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith("material:analyze", { workspaceId: 1, id: 1 }),
    );
    expect(await within(dialog).findByRole("status")).toHaveTextContent("Analisando o material…");
  });

  it("points to the settings when the analysis needs a key or consent", async () => {
    open("/w/1/library", {
      materials: [
        material({ analysis: analysis({ state: "failed", errorCode: "PROVIDER_KEY_MISSING" }) }),
      ],
    });
    const user = userEvent.setup();
    const dialog = await openSubjectDialog(user);
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Sem chave do provedor ou sem consentimento",
    );
    await user.click(within(dialog).getByRole("button", { name: "Ir às Configurações" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByRole("heading", { name: "Configurações" })).toBeVisible();
  });

  it("explains the monthly limit when the analysis is paused", async () => {
    open("/w/1/library", {
      materials: [
        material({ analysis: analysis({ state: "paused", errorCode: "MONTHLY_LIMIT_REACHED" }) }),
      ],
    });
    const user = userEvent.setup();
    const dialog = await openSubjectDialog(user);
    expect(within(dialog).getByRole("alert")).toHaveTextContent("O limite mensal foi atingido");
    expect(within(dialog).getByRole("button", { name: "Analisar de novo" })).toBeVisible();
  });
});

describe("the generate screen and the subject (FR-1, FR-12, FR-13)", () => {
  it("shows the subject in force, with where it comes from", async () => {
    open("/w/1/generate", { materials: [material(inferred())] });
    expect(await screen.findByText("Disciplina:")).toBeVisible();
    expect(screen.getByText("Inferida")).toBeVisible();
    expect(screen.getByText(SUBJECT)).toBeVisible();
    expect(screen.queryByText(/Gerando sem a análise do material/)).toBeNull();
  });

  it("shows the title when no subject is known, and names the informed one", async () => {
    open("/w/1/generate", {
      materials: [
        material({
          subject: {
            value: "Gramática",
            source: "informed",
            informed: "Gramática",
            inferred: null,
          },
          analysis: analysis({ state: "done", analyzedAt: "2026-11-19T10:00:00.000Z" }),
        }),
      ],
    });
    expect(await screen.findByText("Informada")).toBeVisible();
    expect(screen.getByText("Gramática")).toBeVisible();
  });

  it("changes the subject from here, with the same dialog", async () => {
    const fake = open("/w/1/generate", { materials: [material(inferred())] });
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Alterar" }));
    const dialog = await screen.findByRole("dialog", { name: /Disciplina de/ });
    await user.type(within(dialog).getByLabelText("Disciplina ou assunto (opcional)"), "Redação");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith("material:setSubject", {
        workspaceId: 1,
        id: 1,
        subject: "Redação",
      }),
    );
    expect(await screen.findByText("Redação")).toBeVisible();
    expect(screen.getByText("Informada")).toBeVisible();
  });

  it.each([
    ["failed", analysis({ state: "failed", errorCode: "PROVIDER_ERROR" })],
    ["paused", analysis({ state: "paused", errorCode: "MONTHLY_LIMIT_REACHED" })],
  ])("generates without waiting when the analysis is %s, and says so", async (_name, state) => {
    open("/w/1/generate", { materials: [material({ analysis: state })] });
    expect(await screen.findByText(/Gerando sem a análise do material/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Gerar cards" })).toBeEnabled();
  });

  it("starts the analysis of a material that never had one, once, and says it is running", async () => {
    const fake = open("/w/1/generate", { materials: [material()] });
    await waitFor(() =>
      expect(fake.invoke).toHaveBeenCalledWith("material:analyze", { workspaceId: 1, id: 1 }),
    );
    expect(await screen.findByText("Analisando o material…")).toBeVisible();
    expect(screen.getByText(/Gerando sem a análise do material/)).toBeVisible();
    // Reloads of the screen do not ask again.
    expect(
      fake.invoke.mock.calls.filter(([channel]) => channel === "material:analyze"),
    ).toHaveLength(1);
  });

  it("does not start an analysis that is already done or running", async () => {
    const fake = open("/w/1/generate", { materials: [material(inferred())] });
    await screen.findByText("Disciplina:");
    expect(fake.invoke).not.toHaveBeenCalledWith("material:analyze", expect.anything());
  });

  it("says what is generated from a material that is only exam questions (FR-13)", async () => {
    open("/w/1/generate", { materials: [material(inferred())], onlyQuestions: true });
    expect(await screen.findByText(/parece ser só de questões/)).toBeVisible();
  });

  it("does not say it for a material with content", async () => {
    open("/w/1/generate", { materials: [material(inferred())] });
    await screen.findByText("Disciplina:");
    expect(screen.queryByText(/parece ser só de questões/)).toBeNull();
  });
});
