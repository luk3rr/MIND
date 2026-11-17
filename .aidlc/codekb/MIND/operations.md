# Operação

Status: draft · Confiança: média

- **Dev**: `pnpm dev` (electron-vite, `--no-sandbox`). **Build**: `pnpm build`. **Pacote**: `pnpm package` (.deb) / `package:dir`. [src: package.json]
- **Dados**: `MIND_DATA_DIR` ou `app.getPath("userData")`; logs em `userData/logs/mind.log` (`MIND_LOG_LEVEL`); caches de modelos e OCR em `userData/cache`. [src: src/main/index.ts]
- **E2E**: `pnpm e2e` (Playwright + Electron; no CI com `xvfb-run`); `MIND_E2E_FAKE_LLM=1` troca o provedor por um roteirizado. [src: ci.yml; src/main/index.ts]
- **Release**: workflow `release.yml`; `scripts/verify-deb.sh` valida o `.deb`. [src: .github/workflows/release.yml; scripts/]
- pnpm instalado em `~/.local/share/pnpm/bin` e fora do PATH de shells não interativos nesta máquina. [user: observado na sessão]
- **Windows**: o CI empacota um instalador Windows e os releases o anexam; `electron-builder.yml` tem blocos `linux` e `win` que removem binários de outras plataformas. [src: .github/workflows/release.yml; electron-builder.yml:18-80]
