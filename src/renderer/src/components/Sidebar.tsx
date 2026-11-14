/*
 * Filename: components/Sidebar.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import icon from "../assets/icon.png";
import { sectionPath, useRouter } from "../router.js";
import { SECTIONS } from "../sections.js";
import type { SectionSlug } from "../sections.js";
import { T } from "../strings.js";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher.js";

export function Sidebar({ workspaceId, active }: { workspaceId: number; active: SectionSlug }) {
  const { navigate } = useRouter();
  const main = SECTIONS.filter((section) => section.slug !== "settings");
  const settings = SECTIONS.find((section) => section.slug === "settings");

  const item = (slug: SectionSlug, label: string, Icon: (typeof SECTIONS)[number]["icon"]) => (
    <li key={slug}>
      <button
        type="button"
        className="nav-button"
        aria-current={active === slug ? "page" : undefined}
        onClick={() => navigate(sectionPath(workspaceId, slug))}
      >
        <Icon size={18} aria-hidden="true" />
        {label}
      </button>
    </li>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <img src={icon} alt="" width="56" height="56" />
        <span>MIND</span>
      </div>
      <WorkspaceSwitcher activeId={workspaceId} />
      <nav aria-label={T.mainNav}>
        <ul className="nav" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {main.map((section) => item(section.slug, section.label, section.icon))}
        </ul>
      </nav>
      <div className="spacer" />
      <ul className="nav" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {settings && item(settings.slug, settings.label, settings.icon)}
      </ul>
    </aside>
  );
}
