/*
 * Filename: router.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { parseRoute, sectionPath } from "./router.js";

describe("parseRoute", () => {
  it("parses the welcome and section paths", () => {
    expect(parseRoute("/welcome")).toEqual({ name: "welcome" });
    expect(parseRoute("/w/3/study")).toEqual({ name: "section", workspaceId: 3, section: "study" });
  });

  it("rejects unknown sections and malformed paths", () => {
    for (const path of ["/w/3/nope", "/w/x/study", "/study", "", "/w/3/study/extra"]) {
      expect(parseRoute(path)).toEqual({ name: "unknown" });
    }
  });

  it("builds a section path that parses back", () => {
    expect(parseRoute(sectionPath(7, "settings"))).toEqual({
      name: "section",
      workspaceId: 7,
      section: "settings",
    });
  });
});
