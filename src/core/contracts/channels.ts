/*
 * Filename: channels.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { z } from "zod";
import type { ChannelName } from "./channel-names.js";

/** Bumped whenever a channel changes in an incompatible way; checked at startup. */
export const CONTRACT_VERSION = 1;

const route = z
  .string()
  .min(1)
  .max(200)
  .regex(/^\/[A-Za-z0-9/_\-.?=&%]*$/, "route must be an absolute in-app path")
  .refine((value) => !value.startsWith("//"), "route must not be protocol-relative");

const workspaceId = z.number().int().positive();
const workspaceName = z.string().max(500);
const workspaceInfo = z.object({
  id: workspaceId,
  name: z.string(),
  createdAt: z.string(),
});

const costLine = z.object({
  at: z.string(),
  provider: z.string(),
  model: z.string(),
  purpose: z.string(),
  promptTokens: z.number().int(),
  completionTokens: z.number().int(),
  costUsd: z.number(),
});

export const channels = {
  "window:getState": {
    input: z.object({}).strict(),
    output: z.object({ route: route.nullable(), contractVersion: z.literal(CONTRACT_VERSION) }),
  },
  "window:setLastRoute": {
    input: z.object({ route }).strict(),
    output: z.object({}).strict(),
  },
  "workspace:list": {
    input: z.object({}).strict(),
    output: z.object({ workspaces: z.array(workspaceInfo) }),
  },
  "workspace:create": {
    input: z.object({ name: workspaceName }).strict(),
    output: workspaceInfo,
  },
  "workspace:rename": {
    input: z.object({ id: workspaceId, name: workspaceName }).strict(),
    output: workspaceInfo,
  },
  "today:summary": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({
      materials: z.number().int().nonnegative(),
      cards: z.number().int().nonnegative(),
      questions: z.number().int().nonnegative(),
    }),
  },
  "settings:get": {
    input: z.object({}).strict(),
    output: z.object({
      provider: z.string(),
      generationModel: z.string(),
      judgeModel: z.string(),
      monthlyLimitUsd: z.number(),
      keyConfigured: z.boolean(),
      keySource: z.enum(["environment", "stored"]).nullable(),
      consentGiven: z.boolean(),
      consentAcceptedAt: z.string().nullable(),
      spentThisMonth: z.number(),
      month: z.string(),
      knownModels: z.array(z.string()),
    }),
  },
  "settings:save": {
    input: z
      .object({
        apiKey: z.string().max(500).optional(),
        generationModel: z.string().max(200).optional(),
        judgeModel: z.string().max(200).optional(),
        monthlyLimitUsd: z.number().optional(),
      })
      .strict(),
    output: z.object({}).strict(),
  },
  "settings:clearKey": { input: z.object({}).strict(), output: z.object({}).strict() },
  "settings:setConsent": {
    input: z.object({ given: z.boolean() }).strict(),
    output: z.object({}).strict(),
  },
  "settings:refreshModels": {
    input: z.object({}).strict(),
    output: z.object({ refreshed: z.boolean() }),
  },
  "settings:getCost": {
    input: z
      .object({
        year: z.number().int().min(2000).max(3000),
        month: z.number().int().min(1).max(12),
      })
      .strict(),
    output: z.object({ total: z.number(), lines: z.array(costLine) }),
  },
  "workspace:delete": {
    input: z.object({ id: workspaceId }).strict(),
    output: z.object({}).strict(),
  },
} as const satisfies Record<ChannelName, { input: z.ZodType; output: z.ZodType }>;

export type Channels = typeof channels;
export type InputOf<C extends ChannelName> = z.infer<Channels[C]["input"]>;
export type OutputOf<C extends ChannelName> = z.infer<Channels[C]["output"]>;
