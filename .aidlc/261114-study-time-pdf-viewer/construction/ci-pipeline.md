# CI pipeline — study-time-pdf-viewer

O pipeline existente (`.github/workflows/ci.yml`) já cobre este intent sem mudanças: job **verify** (lint, format, typecheck, `pnpm test --coverage`, `xvfb-run -a pnpm e2e`) e job **package** (`.deb`). Os novos testes de unidade, os de componente e os de e2e (`time.spec.ts`, `reader.spec.ts`) rodam nesses passos; o worker do leitor (`reader.worker`) entra no build do `electron-vite` sem configuração extra e o e2e dos dois fluxos passou também contra o app empacotado. Nenhuma alteração de CI foi feita.
