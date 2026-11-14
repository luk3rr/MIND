/*
 * Filename: pages/PlaceholderPage.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { sectionLabel } from "../sections.js";
import type { SectionSlug } from "../sections.js";
import { T } from "../strings.js";

/** Stand-in for sections whose unit has not been built yet. */
export function PlaceholderPage({ section }: { section: SectionSlug }) {
  return (
    <section aria-labelledby="section-title">
      <h1 id="section-title">{sectionLabel(section)}</h1>
      <div className="card">
        <p className="muted">{T.comingSoon}</p>
      </div>
    </section>
  );
}
