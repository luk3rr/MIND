/*
 * Filename: components/SeeInPdf.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { BookOpen } from "lucide-react";
import { readerPath, useRouter } from "../router.js";
import { T } from "../strings.js";

/** Opens the reader of the original PDF on the page a card, question or answer cites. */
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
  return (
    <button
      type="button"
      className="btn ghost"
      aria-label={`${T.seeInPdf}, ${T.page} ${page}`}
      onClick={() => navigate(readerPath(workspaceId, materialId, page, quote))}
    >
      <BookOpen size={14} aria-hidden="true" /> {T.seeInPdf}
    </button>
  );
}
