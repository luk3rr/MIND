# Visão geral

Status: draft · Confiança: alta

**Propósito.** Ferramenta de estudo local-first: importa materiais próprios (PDF, DOCX, Markdown, texto, páginas web), gera flashcards e questões que citam o trecho de origem, e agenda revisões com FSRS. [src: package.json:5; README.md]

**Forma.** Aplicativo desktop Electron (um processo principal + janela React), empacotado como `.deb`; não abre porta de rede. [src: electron-builder.yml; src/main/index.ts]

**Telas (seções).** Hoje, Biblioteca, Gerar, Estudar (e Praticar), Estatísticas, Erros, Chat, Configurações; mais boas-vindas e configuração inicial. [src: src/renderer/src/sections.ts; pages/]

**Vocabulário.** *workspace* (conjunto isolado de materiais e estudo, com banco e pasta próprios); *material* (arquivo importado); *chunk* (trecho de um material, com página e seção); *item* (cartão ou questão gerada, sempre com `quote` e página de origem); *tópico* (rótulo de item); *job* (tarefa em segundo plano). [src: src/core/db/workspace-schema.ts]

**Estado.** Reescrita Python→TypeScript concluída; o Python só existe na tag `legacy-python`. [mem: M-11]
