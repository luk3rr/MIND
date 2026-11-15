/*
 * Filename: components/SeeInPdf.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useState } from "react";
import { BookOpen, ExternalLink } from "lucide-react";
import { readerPath, useRouter } from "../router.js";
import { T } from "../strings.js";

/**
 * Shows the original PDF on the page a card, question or answer cites, in one of two ways: in
 * this window (replacing the screen) or in a separate window, so the study session stays put.
 */
export function SeeInPdf({
  workspaceId,
  materialId,
  page,
  quote,
}: {
  workspaceId: number;
  materialId: number;
  page: number;
  quote?: string;
}) {
  const { navigate } = useRouter();
  const [error, setError] = useState<string | null>(null);
  const openWindow = (): void => {
    void window.mind
      .invoke("reader:openWindow", {
        workspaceId,
        materialId,
        page,
        ...(quote ? { quote: quote.slice(0, 2000) } : {}),
      })
      .then((result) => setError(result.ok ? null : result.error.message));
  };
  return (
    <span className="see-in-pdf">
      <button
        type="button"
        className="btn ghost sm"
        aria-label={`${T.seeInPdf}, ${T.page} ${page}`}
        onClick={() => navigate(readerPath(workspaceId, materialId, page, quote))}
      >
        <BookOpen size={13} aria-hidden="true" /> {T.seeInPdf}
      </button>
      <button
        type="button"
        className="btn ghost sm"
        aria-label={`${T.seeInPdfWindow}, ${T.page} ${page}`}
        title={T.seeInPdfWindow}
        onClick={openWindow}
      >
        <ExternalLink size={13} aria-hidden="true" /> {T.seeInPdfWindow}
      </button>
      {error && (
        <span className="alert" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
