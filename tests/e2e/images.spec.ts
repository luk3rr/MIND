/*
 * Filename: images.spec.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { expect, test } from "@playwright/test";
import { createWriteStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";
import { join } from "node:path";
import { launch, newProfile, removeProfile, ROOT } from "./launch.js";
import type { Launched } from "./launch.js";

let current: Launched | undefined;
const profiles: string[] = [];

test.afterEach(async () => {
  await current?.app.close().catch(() => undefined);
  current = undefined;
});

test.afterAll(() => {
  profiles.splice(0).forEach(removeProfile);
});

const FIXTURES = join(ROOT, "src", "core", "images", "fixtures");

/** Answers the native image chooser with a fixed list of paths, one per call. */
async function chooseFiles(app: Launched["app"], files: string[]): Promise<void> {
  await app.evaluate(({ dialog }, paths) => {
    const queue = [...paths];
    dialog.showOpenDialog = () => {
      const next = queue.shift();
      return Promise.resolve(
        next ? { canceled: false, filePaths: [next] } : { canceled: true, filePaths: [] },
      );
    };
  }, files);
}

test("attaches pictures to a card, studies it and keeps them in the workspace (FR-1, FR-4, FR-9, NFR-2)", async () => {
  const userData = newProfile();
  profiles.push(userData);
  current = await launch(userData);
  const { page, app } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Estudo");
  await page.getByRole("button", { name: "Criar" }).click();

  await page.getByRole("button", { name: "Itens", exact: true }).click();
  await page.getByRole("button", { name: "Novo item" }).click();
  const panel = page.getByRole("dialog", { name: "Novo cartão" });
  await panel.getByLabel("Frente").fill("Qual a estrutura indicada?");
  await panel.getByLabel("Verso").fill("O núcleo.");

  // A vector file is refused by its content and nothing is attached.
  await chooseFiles(app, [join(FIXTURES, "vector.svg"), join(FIXTURES, "square.png")]);
  await panel.getByRole("button", { name: "＋ Imagem" }).first().click();
  await expect(panel.getByRole("alert")).toContainText("Este formato de imagem não é aceito");
  await expect(panel.getByRole("list", { name: "Imagens" })).toHaveCount(0);

  // A picture chosen in the dialog is attached.
  await panel.getByRole("button", { name: "＋ Imagem" }).first().click();
  await expect(panel.getByRole("list", { name: "Imagens" }).getByRole("img")).toHaveCount(1);

  // A picture pasted into the field is attached too, and the field gets no text from it.
  const jpeg = readFileSync(join(FIXTURES, "photo.jpg")).toString("base64");
  await panel.getByLabel("Frente").evaluate((field, base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], "foto.jpg", { type: "image/jpeg" }));
    field.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, jpeg);
  await expect(panel.getByRole("list", { name: "Imagens" }).getByRole("img")).toHaveCount(2);
  await expect(panel.getByLabel("Frente")).toHaveValue("Qual a estrutura indicada?");

  await panel.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(panel).toHaveCount(0);

  // The files live inside the workspace, by hash, and nothing else was written there.
  const images = readdirSync(join(userData, "workspaces"), { recursive: true, encoding: "utf8" })
    .filter((name) => /files[/\\]images[/\\][0-9a-f]{64}\.(png|jpg)$/.test(name))
    .sort();
  expect(images).toHaveLength(2);
  expect(images.every((name) => existsSync(join(userData, "workspaces", name)))).toBe(true);

  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await page.getByRole("button", { name: "Estudar agora (1)" }).click();
  const front = page.getByLabel("Frente");
  await expect(front).toContainText("Qual a estrutura indicada?");
  const pictures = front.getByRole("img");
  await expect(pictures).toHaveCount(2);
  // Both really decoded (a broken data URL has no natural size).
  const sizes = await pictures.evaluateAll((all) =>
    all.map((img) => (img as HTMLImageElement).naturalWidth),
  );
  expect(sizes.every((width) => width > 0)).toBe(true);
  await page.keyboard.press("Space");
  await expect(page.getByLabel("Verso")).toContainText("O núcleo.");
});

test("practises a question with a picture in the statement and one only in an alternative (FR-3, FR-9)", async () => {
  const userData = newProfile();
  profiles.push(userData);
  current = await launch(userData);
  const { page, app } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Estudo");
  await page.getByRole("button", { name: "Criar" }).click();
  await page.getByRole("button", { name: "Itens", exact: true }).click();
  await page.getByRole("button", { name: "Novo item" }).click();
  await page
    .getByRole("dialog", { name: "Novo cartão" })
    .getByRole("radio", { name: "Questão" })
    .check();
  const panel = page.getByRole("dialog", { name: "Nova questão" });

  await panel.getByLabel("Enunciado").fill("Observe a figura e escolha.");
  await panel.getByLabel("Texto da alternativa B").fill("Outra");
  await panel.getByLabel("Justificativa da alternativa A").fill("É a figura.");
  await panel.getByLabel("Justificativa da alternativa B").fill("Não é.");
  await panel.getByRole("button", { name: "Remover alternativa D" }).click();
  await panel.getByRole("button", { name: "Remover alternativa C" }).click();
  await panel.getByLabel("Explicação").fill("A figura mostra a resposta.");

  // Add buttons in order: statement, alternative A, alternative B, comment.
  await chooseFiles(app, [join(FIXTURES, "square.png"), join(FIXTURES, "photo.jpg")]);
  const adds = panel.getByRole("button", { name: "＋ Imagem" });
  await adds.nth(0).click();
  await expect(panel.getByRole("list", { name: "Imagens" })).toHaveCount(1);
  await adds.nth(1).click();
  await expect(panel.getByRole("list", { name: "Imagens" })).toHaveCount(2);
  await panel.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(panel).toHaveCount(0);

  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  await page.getByRole("tab", { name: /Questões/ }).click();
  await expect(page.getByRole("heading", { name: "Praticar questões" })).toBeVisible();
  const decoded = async (count: number) => {
    // Pictures are read only when they come near the screen, so bring each one into view.
    const slots = page.locator(".card .image-list");
    for (let at = 0; at < (await slots.count()); at += 1)
      await slots.nth(at).scrollIntoViewIfNeeded();
    // The pictures inside a radio are presentational for the role query, so use the class.
    const pictures = page.locator("img.item-image");
    await expect(pictures).toHaveCount(count);
    const widths = await pictures.evaluateAll((all) =>
      all.map((img) => (img as HTMLImageElement).naturalWidth),
    );
    expect(widths.every((width) => width > 0)).toBe(true);
  };
  await expect(page.getByText("Observe a figura e escolha.")).toBeVisible();
  // Before the answer: the statement's picture and the one of alternative A (no comment yet).
  await decoded(2);
  await page.getByRole("radio", { name: /Outra/ }).click();
  await page.getByRole("button", { name: "Responder" }).click();
  await expect(page.getByText("A figura mostra a resposta.")).toBeVisible();
});

test("turns and cuts a picture keeping the original, studies it and enlarges it (FR-7, FR-10)", async () => {
  const userData = newProfile();
  profiles.push(userData);
  current = await launch(userData);
  const { page, app } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Estudo");
  await page.getByRole("button", { name: "Criar" }).click();
  await page.getByRole("button", { name: "Itens", exact: true }).click();
  await page.getByRole("button", { name: "Novo item" }).click();
  const panel = page.getByRole("dialog", { name: "Novo cartão" });
  await panel.getByLabel("Frente").fill("Qual a estrutura indicada?");
  await panel.getByLabel("Verso").fill("O núcleo.");

  await chooseFiles(app, [join(FIXTURES, "square.png")]);
  await panel.getByRole("button", { name: "＋ Imagem" }).first().click();
  await panel.getByRole("button", { name: "Editar a imagem 1" }).click();
  const editor = page.getByRole("dialog", { name: "Ajustar imagem" });
  await editor.getByRole("button", { name: "↻ Girar à direita" }).click();
  // The 16 x 12 picture turned a quarter is 12 x 16; the preview is the result itself.
  await expect
    .poll(() =>
      editor.getByRole("img", { name: "Prévia da imagem ajustada" }).evaluate((img) => {
        const picture = img as HTMLImageElement;
        return `${picture.naturalWidth}x${picture.naturalHeight}`;
      }),
    )
    .toBe("12x16");
  await editor.getByRole("button", { name: "Usar imagem" }).click();
  await expect(editor).toHaveCount(0);
  await panel.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(panel).toHaveCount(0);

  // The original and the adjusted picture are both kept in the workspace.
  const files = readdirSync(join(userData, "workspaces"), {
    recursive: true,
    encoding: "utf8",
  }).filter((name) => /files[/\\]images[/\\][0-9a-f]{64}\.png$/.test(name));
  expect(files).toHaveLength(2);

  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await page.getByRole("button", { name: "Estudar agora (1)" }).click();
  const picture = page.getByLabel("Frente").getByRole("img");
  await expect(picture).toHaveCount(1);
  expect(
    await picture.evaluate((img) => {
      const shown = img as HTMLImageElement;
      return `${shown.naturalWidth}x${shown.naturalHeight}`;
    }),
  ).toBe("12x16");

  await page.getByRole("button", { name: /Ampliar imagem/ }).click();
  const zoomed = page.getByRole("dialog", { name: "Imagem do item" });
  await expect(zoomed.getByRole("img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(zoomed).toHaveCount(0);
});

test("keeps the pictures through a backup and a restore and shows their weight (FR-14, FR-17, NFR-4)", async () => {
  const userData = newProfile();
  profiles.push(userData);
  const backup = join(newProfile(), "backup.zip");
  profiles.push(join(backup, ".."));
  current = await launch(userData);
  const { page, app } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Imagens");
  await page.getByRole("button", { name: "Criar" }).click();
  await page.getByRole("button", { name: "Itens", exact: true }).click();
  await page.getByRole("button", { name: "Novo item" }).click();
  const panel = page.getByRole("dialog", { name: "Novo cartão" });
  await panel.getByLabel("Frente").fill("Qual a estrutura indicada?");
  await panel.getByLabel("Verso").fill("O núcleo.");
  await app.evaluate(
    ({ dialog }, paths) => {
      const queue = [...paths.images];
      dialog.showOpenDialog = (...args: unknown[]) => {
        const options = (args.length > 1 ? args[1] : args[0]) as { filters?: { name: string }[] };
        if (options.filters?.[0]?.name === "Backup do MIND") {
          return Promise.resolve({ canceled: false, filePaths: [paths.backup] });
        }
        const next = queue.shift();
        return Promise.resolve(
          next ? { canceled: false, filePaths: [next] } : { canceled: true, filePaths: [] },
        );
      };
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: paths.backup });
    },
    { images: [join(FIXTURES, "square.png"), join(FIXTURES, "photo.jpg")], backup },
  );
  await panel.getByRole("button", { name: "＋ Imagem" }).first().click();
  await expect(panel.getByRole("list", { name: "Imagens" })).toHaveCount(1);
  await panel.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(panel).toHaveCount(0);

  // A picture that no item uses is counted apart and "clear now" removes only that one.
  await page.getByRole("button", { name: "Itens", exact: true }).click();
  await page.getByRole("button", { name: "Novo item" }).click();
  const second = page.getByRole("dialog", { name: "Novo cartão" });
  await second.getByRole("button", { name: "＋ Imagem" }).first().click();
  await expect(second.getByRole("list", { name: "Imagens" })).toHaveCount(1);
  await second.getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Configurações", exact: true }).click();
  const storage = page.getByRole("region", { name: "Armazenamento de imagens" });
  await expect(storage).toContainText("em 2 imagens");
  await expect(storage).toContainText("1 imagem não é usada por nenhum item");
  await storage.getByRole("button", { name: "Limpar agora" }).click();
  await page
    .getByRole("dialog", { name: "Limpar agora" })
    .getByRole("button", { name: "Limpar agora" })
    .click();
  await expect(storage).toContainText("1 imagem removida");
  await expect(storage).toContainText("em 1 imagem");
  await expect(storage).toContainText("Nenhuma imagem sem uso.");

  await page.getByRole("button", { name: /Workspace: Imagens/ }).click();
  await page.getByRole("menuitem", { name: "Exportar…" }).click();
  await expect(page.getByRole("dialog")).toContainText("Backup salvo em");
  expect(existsSync(backup)).toBe(true);
  await page.getByRole("button", { name: "Ok" }).click();
  await page.getByRole("button", { name: /Workspace: Imagens/ }).click();
  await page.getByRole("menuitem", { name: "Importar backup…" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    'Workspace "Imagens (importado)" importado.',
  );
  await page.getByRole("button", { name: "Abrir workspace" }).click();

  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await page.getByRole("button", { name: "Estudar agora (1)" }).click();
  const picture = page.getByLabel("Frente").getByRole("img");
  await expect(picture).toHaveCount(1);
  expect(await picture.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(
    0,
  );
});

test("cuts a region of a PDF page with the mouse and makes a card with it (FR-12, M-14)", async () => {
  const userData = newProfile();
  profiles.push(userData);
  current = await launch(userData);
  const { page, app } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Leitura");
  await page.getByRole("button", { name: "Criar" }).click();
  await app.evaluate(
    ({ dialog }, files) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: files });
    },
    [join(ROOT, "fixtures", "pdfs", "three-pages.pdf")],
  );
  await page.getByRole("button", { name: "Biblioteca", exact: true }).click();
  await page.getByRole("button", { name: "Importar arquivo" }).click();
  await expect(page.getByRole("table").getByText("Indexado")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^Ler (?!em nova janela)/ }).click();
  const sheet = page.getByRole("img", { name: "Página 1" });
  await expect(sheet).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Recortar figura" }).click();
  const layer = page.getByRole("application", {
    name: "Arraste sobre a página para recortar uma figura",
  });
  const box = await layer.boundingBox();
  if (!box) throw new Error("the cutting layer has no box");
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.2, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3, { steps: 5 });
  await page.mouse.up();

  const panel = page.getByRole("dialog", { name: "Recorte da página 1" });
  const cut = panel.getByRole("img", { name: "Imagem do item" });
  await expect(cut).toBeVisible();
  // 50% of A4 wide and 20% high at 200 dpi, and not the page at screen size.
  await expect
    .poll(() =>
      cut.evaluate((img) => {
        const picture = img as HTMLImageElement;
        return [picture.naturalWidth, picture.naturalHeight];
      }),
    )
    .toEqual([
      expect.closeTo((595 * 0.5 * 200) / 72, -1),
      expect.closeTo((842 * 0.2 * 200) / 72, -1),
    ]);
  await panel.getByRole("button", { name: "Novo card…" }).click();
  const editor = page.getByRole("dialog", { name: "Novo cartão" });
  await editor.getByLabel("Frente").fill("O que mostra o recorte?");
  await editor.getByLabel("Verso").fill("Um trecho da página.");
  await editor.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(editor).toHaveCount(0);

  const listed = await page.evaluate(() => window.mind.invoke("items:list", { workspaceId: 1 }));
  expect(listed).toMatchObject({
    ok: true,
    data: {
      items: [expect.objectContaining({ origin: "reader", front: "O que mostra o recorte?" })],
    },
  });
  const files = readdirSync(join(userData, "workspaces"), {
    recursive: true,
    encoding: "utf8",
  }).filter((name) => /files[/\\]images[/\\][0-9a-f]{64}\.png$/.test(name));
  expect(files).toHaveLength(1);
});

test("imports a .zip with a spreadsheet and its pictures and studies a card with the picture (FR-15)", async () => {
  const userData = newProfile();
  profiles.push(userData);
  const zipPath = join(newProfile(), "pacote.zip");
  profiles.push(join(zipPath, ".."));
  const zip = new yazl.ZipFile();
  zip.addBuffer(
    Buffer.from(
      [
        "subtipo;frente;verso;topico;imagem_frente",
        ";Qual a estrutura indicada?;O núcleo.;Biologia;figuras/celula.png",
        ";Pergunta sem figura?;Sim.;Biologia;",
        ";Figura que falta?;Não está no zip.;Biologia;falta.png",
      ].join("\r\n"),
    ),
    "cartoes.csv",
  );
  zip.addBuffer(readFileSync(join(FIXTURES, "square.png")), "figuras/celula.png");
  zip.end();
  await pipeline(zip.outputStream, createWriteStream(zipPath));

  current = await launch(userData);
  const { page, app } = current;
  await page.getByRole("button", { name: "Novo workspace" }).click();
  await page.getByLabel("Nome do workspace").fill("Importação");
  await page.getByRole("button", { name: "Criar" }).click();
  await page.getByRole("button", { name: "Itens", exact: true }).click();
  await page.getByRole("button", { name: "Importar…" }).click();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] });
  }, zipPath);
  await page
    .getByRole("dialog", { name: "Importar itens" })
    .getByRole("button", { name: "Escolher arquivo…" })
    .click();
  const preview = page.getByRole("dialog", { name: "Importar itens" });
  await expect(preview.getByText("pacote.zip · 3 linha(s)")).toBeVisible();
  await expect(preview.getByText("1 imagem(ns) ligada(s) · 1 faltando")).toBeVisible();
  await expect(preview.getByText(/“falta.png” não está no \.zip/)).toBeVisible();
  await preview.getByRole("button", { name: "Importar 3 válida(s)" }).click();
  const done = page.getByRole("dialog", { name: "Importação concluída" });
  await expect(done.getByText(/1 imagem\(ns\) guardada\(s\) com os itens\./)).toBeVisible();
  await done.getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await page.getByRole("button", { name: "Estudar agora (3)" }).click();
  // The cards come in the order of the queue; find the one with the picture.
  const withPicture = page.locator(".card-front", { hasText: "Qual a estrutura indicada?" });
  for (let at = 0; at < 3 && (await withPicture.count()) === 0; at += 1) {
    await page.keyboard.press("Space");
    await page.keyboard.press("3");
  }
  await expect(withPicture.getByRole("img")).toHaveCount(1);
  expect(
    await withPicture.getByRole("img").evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
});
