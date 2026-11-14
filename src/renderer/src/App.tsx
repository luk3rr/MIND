/*
 * Filename: App.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useState } from "react";

/** Placeholder shell: proves the typed IPC round trip. The real shell arrives in UNIT-5. */
export function App() {
  const [route, setRoute] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    void window.mind.invoke("window:getState", {}).then((result) => {
      if (result.ok) setRoute(result.data.route);
    });
  }, []);

  return (
    <main>
      <h1>MIND</h1>
      <p data-testid="route">{route === undefined ? "carregando" : (route ?? "sem rota salva")}</p>
    </main>
  );
}
