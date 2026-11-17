/*
 * Filename: assist.test.tsx
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installFakeMind } from "../test/fake-mind.js";
import { App } from "./App.js";

const ws = { id: 1, name: "Estudos", createdAt: "2026-01-01T00:00:00.000Z" };

beforeEach(() => window.localStorage.clear());

async function openEditor() {
  const fake = installFakeMind({ workspaces: [ws], route: "/w/1/items", catalog: [] });
  render(<App />);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Novo item" }));
  const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
  await user.type(within(panel).getByLabelText("Frente"), "Qual a funcao da mitocondria?");
  await user.type(within(panel).getByLabelText("Verso"), "Produz energia.");
  await user.click(within(panel).getByRole("button", { name: /Melhorar com IA/ }));
  return { fake, user, panel };
}

const cardProposal = {
  kind: "card",
  subtype: "qa",
  front: "Qual a função da mitocôndria?",
  back: "Produz energia.",
} as const;

describe("Model help in the item editor", () => {
  it("shows the proposal beside the original and changes nothing until it is accepted (FR-10, FR-11)", async () => {
    const { fake, user, panel } = await openEditor();
    fake.state.assist = { proposal: cardProposal };
    await user.click(within(panel).getByRole("button", { name: "Corrigir" }));
    const proposal = await screen.findByRole("dialog", { name: "Proposta: Corrigir" });
    expect(
      within(proposal).getByText("Nada é salvo até você aceitar e clicar em Salvar."),
    ).toBeVisible();
    // Only the changed field is listed, with the old words struck and the new ones marked.
    const front = within(proposal).getByRole("region", { name: "Frente" });
    expect(within(front).getByText("funcao").tagName).toBe("DEL");
    expect(within(front).getByText("função").tagName).toBe("INS");
    expect(within(proposal).queryByRole("region", { name: "Verso" })).toBeNull();
    expect(fake.invoke).toHaveBeenCalledWith(
      "assist:improve",
      expect.objectContaining({
        action: "fix",
        draft: expect.objectContaining({ front: "Qual a funcao da mitocondria?" }),
      }),
    );
    expect(fake.invoke).not.toHaveBeenCalledWith("items:create", expect.anything());
  });

  it("applies one field to the form and closes the proposal when none is left (FR-11)", async () => {
    const { fake, user, panel } = await openEditor();
    fake.state.assist = { proposal: cardProposal };
    await user.click(within(panel).getByRole("button", { name: "Corrigir" }));
    await user.click(await screen.findByRole("button", { name: "Aceitar campo: Frente" }));
    const form = await screen.findByRole("dialog", { name: "Novo cartão" });
    expect(within(form).getByLabelText("Frente")).toHaveValue("Qual a função da mitocôndria?");
    expect(
      within(form).getByText("Proposta aplicada ao formulário. Revise e salve."),
    ).toBeVisible();
    expect(fake.invoke).not.toHaveBeenCalledWith("items:create", expect.anything());
    await user.click(within(form).getByRole("button", { name: "Salvar" }));
    expect(fake.invoke).toHaveBeenCalledWith(
      "items:create",
      expect.objectContaining({
        draft: expect.objectContaining({ front: "Qual a função da mitocôndria?" }),
      }),
    );
  });

  it("accepts all the fields at once, or leaves the item exactly as it was on discard", async () => {
    const { fake, user, panel } = await openEditor();
    fake.state.assist = {
      proposal: { ...cardProposal, back: "Produz energia (ATP) para a célula." },
    };
    await user.click(within(panel).getByRole("button", { name: "Melhorar" }));
    await user.click(await screen.findByRole("button", { name: "Descartar" }));
    let form = await screen.findByRole("dialog", { name: "Novo cartão" });
    expect(within(form).getByLabelText("Frente")).toHaveValue("Qual a funcao da mitocondria?");
    expect(within(form).getByLabelText("Verso")).toHaveValue("Produz energia.");
    await user.click(within(form).getByRole("button", { name: "Melhorar" }));
    await user.click(await screen.findByRole("button", { name: "Aceitar tudo" }));
    form = await screen.findByRole("dialog", { name: "Novo cartão" });
    expect(within(form).getByLabelText("Frente")).toHaveValue("Qual a função da mitocôndria?");
    expect(within(form).getByLabelText("Verso")).toHaveValue("Produz energia (ATP) para a célula.");
  });

  it("says so when the model suggests no change", async () => {
    const { fake, user, panel } = await openEditor();
    fake.state.assist = {
      proposal: { ...cardProposal, front: "Qual a funcao da mitocondria?" },
    };
    await user.click(within(panel).getByRole("button", { name: "Melhorar" }));
    expect(await screen.findByText("O modelo não sugeriu mudanças.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Aceitar tudo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Descartar" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(await screen.findByRole("dialog", { name: "Novo cartão" })).toBeVisible();
  });

  it("asks for the instruction when adjusting and shows the field error (FR-10)", async () => {
    const { fake, user, panel } = await openEditor();
    await user.click(within(panel).getByRole("button", { name: "Ajustar…" }));
    fake.state.assist = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Descreva o ajuste que você quer.",
        field: "instruction",
      },
    };
    await user.click(within(panel).getByRole("button", { name: "Pedir ajuste" }));
    expect(await within(panel).findByText("Descreva o ajuste que você quer.")).toBeVisible();
    fake.state.assist = { proposal: cardProposal };
    await user.type(
      within(panel).getByLabelText("O que ajustar (até 500 caracteres)"),
      "mais curto",
    );
    await user.click(within(panel).getByRole("button", { name: "Pedir ajuste" }));
    await screen.findByRole("dialog", { name: "Proposta: Ajustar" });
    expect(fake.invoke).toHaveBeenLastCalledWith(
      "assist:improve",
      expect.objectContaining({ action: "adjust", instruction: "mais curto" }),
    );
  });

  it("shows the wait, and drops the answer of a request that was cancelled", async () => {
    const { fake, user, panel } = await openEditor();
    let release: () => void = () => undefined;
    fake.state.assist = {
      proposal: cardProposal,
      gate: new Promise<void>((resolve) => (release = resolve)),
    };
    await user.click(within(panel).getByRole("button", { name: "Melhorar" }));
    expect(await within(panel).findByText(/Pedindo ao modelo/)).toBeVisible();
    expect(within(panel).getByRole("button", { name: "Corrigir" })).toBeDisabled();
    await user.click(within(panel).getByRole("button", { name: "Cancelar" }));
    expect(within(panel).queryByText(/Pedindo ao modelo/)).toBeNull();
    release();
    // Let the answer of the cancelled request arrive before looking at the screen.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("dialog", { name: /^Proposta/ })).toBeNull();
    expect(within(panel).getByLabelText("Frente")).toHaveValue("Qual a funcao da mitocondria?");
  });

  it("leads to the settings when the key or the consent is missing, and the rest keeps working (FR-9)", async () => {
    const { fake, user, panel } = await openEditor();
    fake.state.assist = {
      error: { code: "CONSENT_REQUIRED", message: "Falta o consentimento para enviar o texto." },
    };
    await user.click(within(panel).getByRole("button", { name: "Melhorar" }));
    expect(
      await within(panel).findByText("Falta o consentimento para enviar o texto."),
    ).toBeVisible();
    expect(within(panel).queryByRole("button", { name: "Tentar de novo" })).toBeNull();
    // Saving by hand does not depend on the model.
    await user.click(within(panel).getByRole("button", { name: "Salvar" }));
    expect(fake.invoke).toHaveBeenCalledWith("items:create", expect.anything());
  });

  it("offers to try again after a failure of the model, and can go to the settings", async () => {
    const { fake, user, panel } = await openEditor();
    fake.state.assist = { error: { code: "PROVIDER_ERROR", message: "O modelo falhou." } };
    await user.click(within(panel).getByRole("button", { name: "Corrigir" }));
    expect(await within(panel).findByText("O modelo falhou.")).toBeVisible();
    fake.state.assist = { proposal: cardProposal };
    await user.click(within(panel).getByRole("button", { name: "Tentar de novo" }));
    await screen.findByRole("dialog", { name: "Proposta: Corrigir" });
    expect(fake.invoke.mock.calls.filter(([channel]) => channel === "assist:improve")).toHaveLength(
      2,
    );
  });

  it("goes to the settings screen from the missing-key notice", async () => {
    const { fake, user, panel } = await openEditor();
    fake.state.assist = {
      error: { code: "PROVIDER_KEY_MISSING", message: "Configure a chave do provedor." },
    };
    await user.click(within(panel).getByRole("button", { name: "Melhorar" }));
    await user.click(await within(panel).findByRole("button", { name: "Ir às Configurações" }));
    expect(await screen.findByRole("heading", { name: "Configurações" })).toBeVisible();
  });

  it("compares the alternatives and the answer of a question (FR-12)", async () => {
    const fake = installFakeMind({ workspaces: [ws], route: "/w/1/items", catalog: [] });
    render(<App />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Novo item" }));
    const panel = await screen.findByRole("dialog", { name: "Novo cartão" });
    await user.click(within(panel).getByRole("radio", { name: "Questão" }));
    await user.type(within(panel).getByLabelText("Enunciado"), "Qual organela produz ATP?");
    await user.type(within(panel).getByLabelText("Texto da alternativa A"), "Mitocondria");
    await user.type(within(panel).getByLabelText("Justificativa da alternativa A"), "Respira");
    await user.type(within(panel).getByLabelText("Texto da alternativa B"), "Ribossomo");
    await user.type(within(panel).getByLabelText("Justificativa da alternativa B"), "Proteínas");
    await user.type(within(panel).getByLabelText("Explicação"), "Respira.");
    fake.state.assist = {
      proposal: {
        kind: "question",
        subtype: "multiple_choice",
        statement: "Qual organela produz ATP?",
        options: [
          { key: "A", text: "Mitocôndria", why: "Respira" },
          { key: "B", text: "Ribossomo", why: "Proteínas" },
          { key: "C", text: "", why: "" },
          { key: "D", text: "", why: "" },
        ],
        answer: "B",
        explanation: "Respira.",
      },
    };
    await user.click(within(panel).getByRole("button", { name: /Melhorar com IA/ }));
    await user.click(within(panel).getByRole("button", { name: "Melhorar" }));
    const proposal = await screen.findByRole("dialog", { name: "Proposta: Melhorar" });
    expect(within(proposal).getByRole("region", { name: "Texto da alternativa A" })).toBeVisible();
    expect(within(proposal).getByRole("region", { name: "Gabarito" })).toBeVisible();
    expect(within(proposal).queryByRole("region", { name: "Enunciado" })).toBeNull();
    await user.click(within(proposal).getByRole("button", { name: "Aceitar campo: Gabarito" }));
    await user.click(within(proposal).getByRole("button", { name: "Aceitar tudo" }));
    const form = await screen.findByRole("dialog", { name: "Nova questão" });
    expect(within(form).getByLabelText("Texto da alternativa A")).toHaveValue("Mitocôndria");
    expect(within(form).getByRole("radio", { name: "Alternativa B é a correta" })).toBeChecked();
  });
});
