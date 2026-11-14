/*
 * Filename: core.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { Clock } from "./clock.js";
import { systemClock } from "./clock.js";
import { JobQueue } from "./jobs/queue.js";
import type { JobEvent } from "./jobs/queue.js";
import { WorkspaceRegistry } from "./workspaces/registry.js";

export interface CoreOptions {
  dataDir: string;
  clock?: Clock;
  maxConcurrentJobs?: number;
  onJobEvent?: (event: JobEvent) => void;
}

/** Everything the application needs, built from a data directory. It never imports Electron. */
export interface Core {
  registry: WorkspaceRegistry;
  queue: JobQueue;
  close(): Promise<void>;
}

export function createCore(options: CoreOptions): Core {
  const clock = options.clock ?? systemClock;
  const registry = new WorkspaceRegistry(options.dataDir, clock);
  const queue = new JobQueue({
    maxConcurrent: options.maxConcurrentJobs ?? 2,
    clock,
    ...(options.onJobEvent ? { onEvent: options.onJobEvent } : {}),
  });
  return {
    registry,
    queue,
    async close() {
      await queue.shutdown();
      registry.close();
    },
  };
}
