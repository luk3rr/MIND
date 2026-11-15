/*
 * Filename: service.ts
 * Created on: November 15, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { setting } from "../db/app-schema.js";
import type { AppConnection } from "../db/databases.js";
import { logger } from "../logging.js";
import { compareVersions, formatVersion, parseVersion } from "./version.js";

const log = logger("update");

export const RELEASES_API = "https://api.github.com/repos/luk3rr/MIND/releases/latest";
/** Only pages under the project's own repository are ever opened from an update notice. */
export const RELEASES_PREFIX = "https://github.com/luk3rr/MIND/";
export const CHECK_TIMEOUT_MS = 10_000;

const KEY_ENABLED = "update.enabled";
const KEY_DISMISSED = "update.dismissed";

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

const releaseSchema = z.object({
  tag_name: z.string(),
  html_url: z.string(),
  draft: z.boolean().optional(),
  prerelease: z.boolean().optional(),
});

export interface ReleaseInfo {
  version: string;
  url: string;
}

export interface UpdateState {
  enabled: boolean;
  current: string;
  /** A newer release the person has not dismissed, or null. */
  available: ReleaseInfo | null;
  /** When the last successful check finished (ISO), or null. */
  checkedAt: string | null;
}

export type CheckOutcome = "disabled" | "current" | "available" | "error";

export interface CheckResult {
  outcome: CheckOutcome;
  state: UpdateState;
  /** The newer release that exists, even when the person dismissed its notice. */
  release: ReleaseInfo | null;
}

export interface UpdateOptions {
  currentVersion: string;
  fetch: Fetcher;
  clock?: Clock;
  apiUrl?: string;
  /** Called when a release newer than the installed one is found and not dismissed. */
  onAvailable?: (release: ReleaseInfo) => void;
}

/**
 * Asks GitHub for the latest release of MIND and tells whether it is newer than the installed
 * version. It sends no data about the person or the computer: one anonymous GET to the public API.
 */
export class UpdateService {
  private latest: ReleaseInfo | null = null;
  private checkedAt: string | null = null;
  private announced: string | null = null;
  private readonly clock: Clock;

  constructor(
    private readonly connection: AppConnection,
    private readonly options: UpdateOptions,
  ) {
    this.clock = options.clock ?? systemClock;
  }

  private read(key: string): string | undefined {
    return this.connection.db.select().from(setting).where(eq(setting.key, key)).get()?.value;
  }

  private write(key: string, value: string): void {
    this.connection.db
      .insert(setting)
      .values({ key, value })
      .onConflictDoUpdate({ target: setting.key, set: { value } })
      .run();
  }

  /** Whether the automatic check is on; it is on until the person turns it off. */
  enabled(): boolean {
    return this.read(KEY_ENABLED) !== "0";
  }

  setEnabled(enabled: boolean): UpdateState {
    this.write(KEY_ENABLED, enabled ? "1" : "0");
    return this.state();
  }

  state(): UpdateState {
    const release = this.latest;
    const newer =
      release !== null &&
      this.isNewer(release.version) &&
      this.read(KEY_DISMISSED) !== release.version;
    return {
      enabled: this.enabled(),
      current: this.options.currentVersion,
      available: newer ? release : null,
      checkedAt: this.checkedAt,
    };
  }

  /** "Not now": the notice for this version is hidden; a later version shows it again. */
  dismiss(version: string): UpdateState {
    this.write(KEY_DISMISSED, version);
    return this.state();
  }

  /** The release page to open for the update on offer, or null when there is none. */
  releaseUrl(): string | null {
    return this.latest && this.isNewer(this.latest.version) ? this.latest.url : null;
  }

  private isNewer(version: string): boolean {
    const remote = parseVersion(version);
    const current = parseVersion(this.options.currentVersion);
    return remote !== null && current !== null && compareVersions(remote, current) > 0;
  }

  /**
   * Looks for a newer release. The automatic check obeys the setting; `force` (the person asked)
   * does not. A failure never throws: it is reported as "error".
   */
  async check(force = false): Promise<CheckResult> {
    if (!force && !this.enabled()) {
      return { outcome: "disabled", state: this.state(), release: null };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    try {
      const response = await this.options.fetch(this.options.apiUrl ?? RELEASES_API, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "MIND" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = releaseSchema.parse(await response.json());
      this.checkedAt = this.clock.now().toISOString();
      const version = parseVersion(parsed.tag_name);
      if (
        parsed.draft ||
        parsed.prerelease ||
        !version ||
        !parsed.html_url.startsWith(RELEASES_PREFIX)
      ) {
        this.latest = null;
        return { outcome: "current", state: this.state(), release: null };
      }
      this.latest = { version: formatVersion(version), url: parsed.html_url };
      const state = this.state();
      const release = this.releaseUrl() ? this.latest : null;
      if (state.available) {
        log.info("new release found", { version: state.available.version });
        if (this.announced !== state.available.version) {
          this.announced = state.available.version;
          this.options.onAvailable?.(state.available);
        }
        return { outcome: "available", state, release };
      }
      return { outcome: release ? "available" : "current", state, release };
    } catch (error) {
      log.warn("update check failed", { error: error instanceof Error ? error.name : "unknown" });
      return { outcome: "error", state: this.state(), release: null };
    } finally {
      clearTimeout(timer);
    }
  }
}
