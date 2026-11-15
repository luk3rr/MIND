/*
 * Filename: router.test.tsx
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { describe, expect, it } from "vitest";
import { parseRoute, readerPath, sectionPath } from "./router.js";

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

describe("reader routes (FR-15)", () => {
  it("parses the reader path with an optional page", () => {
    expect(parseRoute("/w/1/library/4/read")).toEqual({
      name: "section",
      workspaceId: 1,
      section: "library",
      detailId: 4,
      reader: true,
    });
    expect(parseRoute("/w/1/library/4/read?page=3")).toEqual({
      name: "section",
      workspaceId: 1,
      section: "library",
      detailId: 4,
      reader: true,
      page: 3,
    });
    expect(parseRoute(readerPath(2, 9, 12))).toMatchObject({ detailId: 9, reader: true, page: 12 });
    expect(readerPath(2, 9)).toBe("/w/2/library/9/read");
  });

  it("rejects the reader path in other places and bad queries", () => {
    for (const path of [
      "/w/1/library/read",
      "/w/1/study/4/read",
      "/w/1/library/4/write",
      "/w/1/library/4/read/extra",
      "/w/1/library/4/read?page=0",
      "/w/1/library/4/read?page=x",
      "/w/1/library/4/read?chunk=2",
      "/w/1/library/4?page=2",
    ]) {
      expect(parseRoute(path)).toEqual({ name: "unknown" });
    }
  });
});
