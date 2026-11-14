<p align="center">
  <img src="docs/icon.png" alt="Ícone do MIND: um cérebro roxo com circuitos" width="128" height="128">
</p>

<h1 align="center">MIND</h1>

<p align="center">
  Aplicativo desktop de estudo que gera flashcards e questões a partir dos seus próprios materiais,
  sempre citando o trecho de origem.
</p>

Importe seus materiais (PDF, Word, Markdown, texto e páginas web) e o MIND gera flashcards e
questões no estilo de prova que **citam a passagem de origem**. Depois você estuda tudo com
repetição espaçada (FSRS).

- **Seu material, sua máquina.** Tudo fica guardado localmente. Só trechos curtos vão ao provedor de
  IA que você configurar, e somente depois de você aceitar o aviso que diz qual provedor os recebe.
  Nada roda como servidor: o app não abre nenhuma porta de rede.
- **Todo item cita a fonte.** Um card ou questão só é mantido se a citação for encontrada no trecho
  de onde veio; as questões ainda passam por uma segunda verificação feita por outro modelo.
- **Estude offline.** Revisão, prática, estatísticas e biblioteca funcionam sem rede. Só geração,
  verificação e chat precisam dela.
- **Interface em português do Brasil** (os materiais podem estar em qualquer idioma).

## Instalação

Baixe o `mind-study_<versão>_amd64.deb` e instale no Debian, Ubuntu ou derivados:

```bash
sudo apt install ./mind-study_0.1.0_amd64.deb
```

O MIND aparece no menu de aplicativos. Remover o pacote (`sudo apt remove mind-study`) nunca apaga
os seus dados. Para gerar o pacote você mesmo, veja [Desenvolvimento](#desenvolvimento).

## Primeiros passos

1. Abra o MIND e crie um workspace (um por assunto ou prova).
2. Em **Configurações** (ou no assistente da primeira execução) cole sua chave da
   [OpenRouter](https://openrouter.ai) e leia o aviso sobre o que é enviado. A chave também pode vir
   da variável de ambiente `OPENROUTER_API_KEY`.
3. Em **Biblioteca**, importe um arquivo ou uma página web. `samples/fotossintese.md` é um texto
   curto para experimentar.
4. Em **Gerar**, escolha o material, o tipo (cards ou questões) e a quantidade; o custo estimado
   aparece antes de começar. Revise os rascunhos e aprove os que quiser.
5. **Estude** a fila do dia (Espaço revela, 1 a 4 avaliam, Ctrl+Z desfaz) e **Pratique** questões.
6. Acompanhe o progresso em **Estatísticas**, revise os erros em **Erros**, treine os pontos fracos
   a partir de **Hoje** e pergunte ao **Chat** sobre o seu próprio material.

A busca semântica opcional (painel do Chat) baixa uma vez um modelo multilíngue pequeno (cerca de
130 MB) e o executa no seu computador.

## Onde ficam os dados

Por usuário, na pasta de dados do aplicativo (`~/.config/mind` no Linux): `app.db` (configurações,
custos e consentimento), uma pasta por workspace com o `workspace.db` e os arquivos originais, e
caches dos dados de OCR e do modelo de busca. A chave de API fica cifrada em um arquivo com
permissão `0600`. Exporte um workspace para `.zip` (e importe em outra máquina) pelo menu do
workspace.

## Desenvolvimento

Requisitos: Node.js 22+ e [pnpm](https://pnpm.io) 10 (`corepack enable` instala).

```bash
pnpm install
pnpm dev                 # roda o app com recarga automática
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test --coverage
pnpm e2e                 # testes de ponta a ponta (Playwright com Electron; precisa de tela ou xvfb)
pnpm package             # gera o .deb em dist/ (verificação precisa de lintian e desktop-file-utils)
scripts/verify-deb.sh    # confere metadados, conteúdo, limites de tamanho e lintian
```

O código é um pacote único:

| Pasta          | O que contém                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core`     | A lógica do aplicativo, sem depender do Electron: SQLite e Drizzle, importação, geração, verificação, estudo, estatísticas, chat e backup |
| `src/main`     | O processo principal do Electron: janela, diálogos nativos, roteador IPC tipado e workers                                                 |
| `src/preload`  | A ponte mínima e validada exposta à janela                                                                                                |
| `src/renderer` | A interface em React (Vite): páginas, componentes e tokens de design                                                                      |
| `tests/e2e`    | Testes do app inteiro, também executados contra o `.deb` instalado                                                                        |
| `fixtures`     | Valores de referência congelados da versão original em Python (veja o README da pasta)                                                    |

A janela conversa com o núcleo por um único canal IPC, com esquemas compartilhados (zod); não há
servidor HTTP. Segurança: isolamento de contexto, sandbox, CSP estrita, navegação bloqueada e nenhum
acesso ao Node no renderer.

O MIND foi escrito primeiro em Python; essa implementação continua no histórico do git, na tag
`legacy-python`.

## Licença

AGPL-3.0-or-later. Veja [LICENSE](LICENSE) e [NOTICE](NOTICE).
