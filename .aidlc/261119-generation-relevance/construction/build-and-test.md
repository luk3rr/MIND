# Build and test — generation-relevance

## Baseline (antes do primeiro commit de código; HEAD 8330836, tarefa T-1.1)

- `pnpm test --coverage`: **2 falhas, 1358 passaram** (131 arquivos). As duas falhas são instabilidade sob a carga da cobertura, não regressão: `calibration.test.tsx > chooses the level with Alt+1 to Alt+3` e `mix.test.tsx > offers to alternate by material` passam isoladamente (`vitest run` do arquivo). Registradas como pré-existentes.
- `xvfb-run -a pnpm e2e`: **61 passaram, 1 pulado**, exit 0 (2,4 min).
- Os números do baseline antigo (1192 testes, 96,45%) ficaram para trás: a suíte hoje tem 1360 testes.
