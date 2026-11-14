/*
 * Filename: consent.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { eq } from "drizzle-orm";
import { isoNow, systemClock } from "../clock.js";
import type { Clock } from "../clock.js";
import { consent } from "../db/app-schema.js";
import type { AppConnection } from "../db/databases.js";

/** Records that the user accepted sending excerpts of their material to a provider (FR-20). */
export class ConsentService {
  constructor(
    private readonly connection: AppConnection,
    private readonly clock: Clock = systemClock,
  ) {}

  isGiven(provider: string): boolean {
    return this.givenAt(provider) !== null;
  }

  givenAt(provider: string): string | null {
    return (
      this.connection.db.select().from(consent).where(eq(consent.provider, provider)).get()
        ?.acceptedAt ?? null
    );
  }

  give(provider: string): void {
    this.connection.db
      .insert(consent)
      .values({ provider, acceptedAt: isoNow(this.clock) })
      .onConflictDoNothing()
      .run();
  }

  revoke(provider: string): void {
    this.connection.db.delete(consent).where(eq(consent.provider, provider)).run();
  }
}
