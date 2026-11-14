# MIND

Ferramenta de estudo **local-first**: você importa seus próprios materiais (PDF, Word, Markdown, páginas web) e o MIND gera **flashcards e questões que citam o trecho de origem**, depois ajuda a estudá-los com repetição espaçada. Funciona para qualquer assunto: provas, cursos, certificações ou estudo por conta própria.

- **Fonte em tudo.** Cada card e cada questão traz o arquivo, a página e a citação exata; o app confere que a citação existe de verdade no material e descarta o que não confere.
- **Você revisa antes de estudar.** Nada entra no baralho sem aprovação, e nada é gerado sem você pedir.
- **Seus dados ficam no seu computador.** Só os trechos usados na geração são enviados ao modelo (OpenRouter), e só depois do seu consentimento.

## O que ele faz

| Recurso | Resumo |
|---|---|
| Biblioteca | PDF (com OCR para escaneados), `.docx`, Markdown, texto e páginas web |
| Gerar | Cards (pergunta e resposta, lacuna, comparação, certo/errado) e questões (Certo/Errado, múltipla escolha) |
| Revisar | Aprovar, editar ou descartar, com a fonte ao lado |
| Estudar | Repetição espaçada (FSRS), meta diária e limite de cards novos |
| Praticar | Questões com correção, comentário e tempo |
| Erros e estatísticas | Caderno de erros, retenção, sequência e acerto por tópico; **treino dos pontos fracos** |
| Chat | Perguntas sobre o material, com citações ou a resposta "não encontrei suporte" |
| Backup | Exportar e importar um workspace em `.zip` |
| API | JSON em `/api/v1`, documentação em `/api/docs` |

## Instalação

Requisitos: **Python 3.12+** e o [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/luk3rr/MIND.git
cd MIND
uv sync
uv run mind
```

Abra <http://127.0.0.1:8000>. Na primeira vez o app guia você por três passos: criar um workspace, informar a chave do [OpenRouter](https://openrouter.ai/keys) e aceitar o envio de trechos ao provedor.

Sem clonar o repositório (depois que o pacote estiver publicado): `uvx --from mind-study mind`.

### OCR para PDFs escaneados (opcional)

Instale o Tesseract e o idioma português:

```bash
sudo apt install tesseract-ocr tesseract-ocr-por   # Debian/Ubuntu
brew install tesseract tesseract-lang              # macOS
```

Sem ele, PDFs com texto selecionável funcionam normalmente; os escaneados mostram um aviso com esta instrução.

### Busca semântica no chat (opcional)

```bash
uv sync --extra embeddings
```

Depois ative em **Chat → Busca semântica**. O modelo é baixado na primeira ativação (centenas de MB). Sem o extra, o chat usa só busca por palavras.

### Docker (opcional)

```bash
docker build -t mind .
docker run --rm -p 127.0.0.1:8000:8000 -v mind-data:/data mind
```

A imagem já inclui o Tesseract.

## Primeiro baralho em 5 minutos

1. Crie um workspace e configure a chave do OpenRouter.
2. Em **Biblioteca**, importe `samples/fotossintese.md` (ou um PDF seu).
3. Em **Gerar**, escolha o material, o tipo "pergunta e resposta" e 10 cards; veja a estimativa de custo e clique em **Gerar**.
4. Em **Revisar**, aprove os cards bons (cada um mostra a citação) e descarte os fracos.
5. Em **Estudar**, comece a repetição espaçada.

## Configuração

Tudo é opcional; copie `.env.example` para `.env` para alterar. Os dados ficam no diretório de dados do usuário (`MIND_DATA_DIR`), com um `workspace.db` por workspace. Os modelos de geração e de juiz e o limite mensal de custo são ajustados na tela **Configurações**.

| Variável | Padrão | Para quê |
|---|---|---|
| `MIND_DATA_DIR` | diretório de dados do usuário | onde ficam bancos, arquivos e a chave |
| `MIND_HOST`, `MIND_PORT` | `127.0.0.1`, `8000` | onde o servidor escuta |
| `MIND_MAX_JOBS` | `2` | tarefas simultâneas |
| `MIND_MAX_UPLOAD_MB` | `200` | tamanho máximo de upload |
| `MIND_OCR_LANGS` | `por+eng` | idiomas do OCR |
| `MIND_LOG_LEVEL` | `INFO` | nível de log |

## Segurança e privacidade

- **A API não tem autenticação.** Mantenha `MIND_HOST=127.0.0.1`. O app só aceita requisições do próprio navegador (verificação de `Host` e de origem) e usa uma política de conteúdo restritiva, mas isso não substitui um login: não exponha a porta na internet.
- A chave do OpenRouter fica em `<diretório de dados>/.env` com permissão `600` e é removida dos logs. Ela nunca entra em backups.
- Trechos do material só saem do computador quando você pede uma geração ou uma pergunta no chat, e apenas após o consentimento. Há um limite mensal de custo configurável; cada chamada fica no registro de custos.

## Desenvolvimento

```bash
uv sync
uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest --cov --cov-fail-under=80
```

Para medir a qualidade dos cards gerados: `uv run mind sm1` (parcela aprovada sem edição; `--kind question` para questões).

## Licença

[AGPL-3.0-or-later](LICENSE). O MIND usa o PyMuPDF (AGPL-3.0). Os componentes de terceiros empacotados e suas licenças estão em [NOTICE](NOTICE).
