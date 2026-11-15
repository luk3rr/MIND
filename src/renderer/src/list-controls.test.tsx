/*
 * Filename: list-controls.test.tsx
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ListSearch, Pager, SEARCH_MIN, usePagedList } from "./components/ListControls.js";

const NAMES = [
  "Agregados monetários",
  "Base monetária",
  "Bem inferior",
  "Bens de Giffen",
  "Cobb-Douglas",
  "Contas Nacionais",
  "Criação de moeda",
  "Curva de demanda",
  "Definição de moeda",
  "Demanda hicksiana",
  "Elasticidade-renda",
  "Elasticidade-preço",
];

function Harness({ items = NAMES, pageSize = 5 }: { items?: string[]; pageSize?: number }) {
  const [tab, setTab] = useState("a");
  const list = usePagedList(items, pageSize, (name) => name, tab);
  return (
    <div>
      <button type="button" onClick={() => setTab(tab === "a" ? "b" : "a")}>
        trocar aba
      </button>
      <ListSearch list={list} label="Buscar nomes" />
      <ul>
        {list.pageItems.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <Pager list={list} />
    </div>
  );
}

describe("usePagedList, ListSearch and Pager", () => {
  it("shows one page at a time and moves between pages", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("status")).toHaveTextContent("1–5 de 12");
    expect(screen.getByText("Página 1 de 3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(screen.getByText("Contas Nacionais")).toBeVisible();
    expect(screen.queryByText("Cobb-Douglas")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("6–10 de 12");
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("status")).toHaveTextContent("11–12 de 12");
    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByText("Página 2 de 3")).toBeVisible();
  });

  it("searches every word, ignoring case and accents, and goes back to the first page", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await user.type(screen.getByRole("searchbox", { name: "Buscar nomes" }), "ELASTICIDADE preco");
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Elasticidade-preço",
    ]);
    // One page only: no pager.
    expect(screen.queryByRole("navigation", { name: "Paginação" })).toBeNull();
    await user.clear(screen.getByRole("searchbox", { name: "Buscar nomes" }));
    await user.type(screen.getByRole("searchbox", { name: "Buscar nomes" }), "moeda");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    await user.clear(screen.getByRole("searchbox", { name: "Buscar nomes" }));
    expect(screen.getByText("Página 1 de 3")).toBeVisible();
  });

  it("says when nothing matches", async () => {
    render(<Harness />);
    await userEvent.setup().type(screen.getByRole("searchbox"), "zzz");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("Nenhum resultado para “zzz”.")).toBeVisible();
  });

  it("goes back to the first page and clears the search when the tab changes", async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await user.type(screen.getByRole("searchbox"), "de");
    await user.click(screen.getByRole("button", { name: "trocar aba" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByText("Página 1 de 3")).toBeVisible();
  });

  it("keeps a short list free of the search box and the pager", () => {
    render(<Harness items={NAMES.slice(0, SEARCH_MIN - 1)} pageSize={10} />);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(SEARCH_MIN - 1);
  });

  it("stays on a page that still exists when the list shrinks", async () => {
    const { rerender } = render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    await user.click(screen.getByRole("button", { name: "Próxima" }));
    rerender(<Harness items={NAMES.slice(0, 6)} />);
    expect(screen.getByText("Página 2 de 2")).toBeVisible();
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(1);
  });
});
