/*
 * Filename: time-precision.test.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { afterEach, expect, it } from "vitest";
import { createCore } from "../core.js";
import type { Core } from "../core.js";
import { fixedClock, tempDir } from "../test/helpers.js";

let core: Core | undefined;
afterEach(async () => {
  await core?.close();
  core = undefined;
});

/** Study with pauses for one simulated hour; the measured time must match within one minute (NFR-1). */
it("measures an hour of mixed study within one minute of the real active time", () => {
  const clock = fixedClock("2026-03-10T09:00:00.000Z");
  core = createCore({ dataDir: tempDir(), env: {}, clock, tzOffset: () => 0 });
  const workspaceId = core.registry.create("Precisão").id;
  const time = core.time(workspaceId);
  // Each block is [seconds of activity with a ping every 4 s, seconds of silence afterwards].
  const blocks: [number, number][] = [
    [600, 300],
    [420, 45],
    [900, 600],
    [300, 0],
    [180, 255],
  ];
  let expected = 0;
  let elapsed = 0;
  for (const [active, silence] of blocks) {
    for (let second = 0; second < active; second += 4) {
      time.activity("cards");
      clock.advance(4_000);
      time.tick();
    }
    // The last ping of a block is followed by up to 4 s of reading with no interaction.
    expected += active;
    elapsed += active;
    const idle = silence;
    // Silence shorter than the idle limit stays in the interval until the next ping.
    if (idle > 0 && idle <= 120) expected += idle;
    clock.advance(idle * 1000);
    elapsed += idle;
    time.tick();
  }
  const measured = time.state().todaySeconds;
  expect(elapsed).toBeLessThanOrEqual(3600);
  expect(Math.abs(measured - expected)).toBeLessThanOrEqual(60);
});
