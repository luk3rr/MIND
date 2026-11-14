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

const materialInfo = z.object({
  id: z.number().int(),
  title: z.string(),
  kind: z.string(),
  filename: z.string(),
  status: z.string(),
  pageCount: z.number().int().nullable(),
  charCount: z.number().int().nullable(),
  ocrConfidence: z.number().nullable(),
  jobId: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  errorDetail: z.string().nullable(),
  createdAt: z.string(),
  sourceUrl: z.string().nullable(),
  /** Progress (0 to 1) of an active import, otherwise null. */
  progress: z.number().nullable(),
  chunkCount: z.number().int(),
});

const chunkInfo = z.object({
  id: z.number().int(),
  materialId: z.number().int(),
  ordinal: z.number().int(),
  page: z.number().int().nullable(),
  section: z.string().nullable(),
  text: z.string(),
});

const generationRequest = z
  .object({
    workspaceId,
    materialId: z.number().int().positive().optional(),
    /** Train on a topic instead of a material. */
    topicId: z.number().int().positive().optional(),
    subtype: z.enum([
      "qa",
      "cloze",
      "compare",
      "true_false",
      "certo_errado",
      "multiple_choice_4",
      "multiple_choice_5",
    ]),
    quantity: z.number().int().min(1).max(200),
    kind: z.enum(["card", "question"]),
    pageFrom: z.number().int().min(1).optional(),
    pageTo: z.number().int().min(1).optional(),
  })
  .strict();

const discardNote = z.object({ reason: z.string(), front: z.string() });

const runInfo = z.object({
  id: z.number().int(),
  kind: z.string(),
  subtype: z.string(),
  materialId: z.number().int().nullable(),
  pageFrom: z.number().int().nullable(),
  pageTo: z.number().int().nullable(),
  topicId: z.number().int().nullable(),
  model: z.string(),
  requested: z.number().int(),
  generated: z.number().int(),
  discardedNoSource: z.number().int(),
  discardedInvalid: z.number().int(),
  discardedDuplicate: z.number().int(),
  discardedUnsupported: z.number().int(),
  approved: z.number().int(),
  approvedUnedited: z.number().int(),
  discardedReview: z.number().int(),
  costUsd: z.number(),
  status: z.string(),
  discardLog: z.array(discardNote),
  errorCode: z.string().nullable(),
  errorDetail: z.string().nullable(),
  jobId: z.number().int().nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  /** Progress (0 to 1) of an active run, otherwise null. */
  progress: z.number().nullable(),
});

const itemInfo = z.object({
  id: z.number().int(),
  runId: z.number().int(),
  kind: z.string(),
  subtype: z.string(),
  front: z.string(),
  back: z.string(),
  status: z.string(),
  topic: z.string().nullable(),
  sourceTitle: z.string(),
  sourcePage: z.number().int().nullable(),
  quote: z.string(),
  chunkId: z.number().int().nullable(),
  edited: z.boolean(),
  origin: z.string(),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
  options: z.array(z.object({ key: z.string(), text: z.string(), why: z.string() })),
  answer: z.string().nullable(),
});

const reviewResult = z.object({
  approved: z.number().int(),
  discarded: z.number().int(),
  skipped: z.number().int(),
});

const studyFilter = z
  .object({
    topicId: z.number().int().positive().optional(),
    materialId: z.number().int().positive().optional(),
    subtype: z.string().max(40).optional(),
  })
  .strict();

const facet = z.object({
  key: z.union([z.number(), z.string()]),
  label: z.string(),
  count: z.number().int(),
});

const studyCounts = z.object({
  learning: z.number().int(),
  review: z.number().int(),
  newAvailable: z.number().int(),
  reviewedToday: z.number().int(),
  newStudiedToday: z.number().int(),
  toStudy: z.number().int(),
});

const studySettings = z.object({
  newPerDay: z.number().int(),
  dailyGoal: z.number().int(),
  desiredRetention: z.number(),
});

const piece = z.object({ text: z.string(), hit: z.boolean() });

const practiceCounts = z.object({
  unseen: z.number().int(),
  retry: z.number().int(),
  answeredToday: z.number().int(),
  correctToday: z.number().int(),
  toPractice: z.number().int(),
});

const topicInfo = z.object({
  id: z.number().int(),
  name: z.string(),
  cards: z.number().int(),
  questions: z.number().int(),
});

const topicStat = z.object({
  topicId: z.number().int().nullable(),
  name: z.string().nullable(),
  cardReviews: z.number().int(),
  cardPasses: z.number().int(),
  questionAttempts: z.number().int(),
  questionCorrect: z.number().int(),
  events: z.number().int(),
  accuracy: z.number().nullable(),
  cardAccuracy: z.number().nullable(),
  questionAccuracy: z.number().nullable(),
  smallSample: z.boolean(),
});

const errorEntry = z.object({
  itemId: z.number().int(),
  front: z.string(),
  topic: z.string().nullable(),
  sourceTitle: z.string(),
  sourcePage: z.number().int().nullable(),
  fromQuestion: z.boolean(),
  failures: z.number().int(),
  lastErrorAt: z.string(),
});

const citationInfo = z.object({
  chunkId: z.number().int(),
  materialId: z.number().int(),
  materialTitle: z.string(),
  page: z.number().int().nullable(),
  section: z.string().nullable(),
  quote: z.string(),
});

const chatReply = z.object({
  id: z.number().int(),
  question: z.string(),
  answer: z.string(),
  supported: z.boolean(),
  citations: z.array(citationInfo),
  costUsd: z.number(),
  createdAt: z.string(),
});

const embeddingStatus = z.object({
  modelReady: z.boolean(),
  enabled: z.boolean(),
  indexed: z.number().int(),
  total: z.number().int(),
  model: z.string(),
  /** The latest vectorizing job (progress while it runs, the error when it failed). */
  job: z
    .object({
      state: z.string(),
      progress: z.number(),
      message: z.string(),
      errorDetail: z.string().nullable(),
    })
    .nullable(),
});

const timeSource = z.enum(["cards", "practice", "reading", "manual"]);

const timeState = z.object({
  status: z.enum(["idle", "running", "paused"]),
  mode: z.enum(["auto", "manual"]).nullable(),
  source: timeSource.nullable(),
  pausedReason: z.enum(["manual", "idle", "blur"]).nullable(),
  startedAt: z.string().nullable(),
  activeSeconds: z.number().int().min(0),
  topicId: z.number().int().nullable(),
  materialId: z.number().int().nullable(),
  todaySeconds: z.number().int().min(0),
  goalMinutes: z.number().int().min(0),
  bySource: z.object({
    cards: z.number().int().min(0),
    practice: z.number().int().min(0),
    reading: z.number().int().min(0),
    manual: z.number().int().min(0),
  }),
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
  "material:list": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({ materials: z.array(materialInfo) }),
  },
  "material:import": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({
      materials: z.array(materialInfo),
      errors: z.array(z.object({ file: z.string(), message: z.string() })),
    }),
  },
  "material:importUrl": {
    input: z.object({ workspaceId, url: z.string().max(3000) }).strict(),
    output: materialInfo,
  },
  "material:delete": {
    input: z.object({ workspaceId, id: z.number().int().positive() }).strict(),
    output: z.object({}).strict(),
  },
  "material:chunks": {
    input: z
      .object({
        workspaceId,
        materialId: z.number().int().positive(),
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        chunkId: z.number().int().positive().optional(),
      })
      .strict(),
    output: z.object({
      material: materialInfo,
      chunks: z.array(chunkInfo),
      total: z.number().int(),
      offset: z.number().int(),
      previousOffset: z.number().int().nullable(),
      nextOffset: z.number().int().nullable(),
    }),
  },
  "material:search": {
    input: z
      .object({
        workspaceId,
        query: z.string().max(500),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .strict(),
    output: z.object({
      hits: z.array(
        z.object({
          chunkId: z.number().int(),
          materialId: z.number().int(),
          materialTitle: z.string(),
          page: z.number().int().nullable(),
          section: z.string().nullable(),
          text: z.string(),
          score: z.number(),
        }),
      ),
    }),
  },
  "generation:estimate": {
    input: generationRequest,
    output: z.object({
      estimatedUsd: z.number().nullable(),
      chunks: z.number().int(),
      batches: z.number().int(),
      promptChars: z.number().int(),
    }),
  },
  "generation:start": { input: generationRequest, output: runInfo },
  "generation:cancel": {
    input: z.object({ workspaceId, runId: z.number().int().positive() }).strict(),
    output: z.object({ cancelled: z.boolean() }),
  },
  "generation:list": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({ runs: z.array(runInfo) }),
  },
  "generation:get": {
    input: z.object({ workspaceId, runId: z.number().int().positive() }).strict(),
    output: runInfo,
  },
  "review:list": {
    input: z
      .object({
        workspaceId,
        runId: z.number().int().positive(),
        status: z.enum(["draft", "approved", "discarded"]).optional(),
      })
      .strict(),
    output: z.object({
      run: runInfo,
      items: z.array(itemInfo),
      counts: z.object({
        draft: z.number().int(),
        approved: z.number().int(),
        discarded: z.number().int(),
      }),
    }),
  },
  "review:get": {
    input: z.object({ workspaceId, itemId: z.number().int().positive() }).strict(),
    output: z.object({ item: itemInfo, sourceText: z.string().nullable() }),
  },
  "review:approve": {
    input: z
      .object({ workspaceId, ids: z.array(z.number().int().positive()).min(1).max(1000) })
      .strict(),
    output: reviewResult,
  },
  "review:discard": {
    input: z
      .object({ workspaceId, ids: z.array(z.number().int().positive()).min(1).max(1000) })
      .strict(),
    output: reviewResult,
  },
  "review:approveAll": {
    input: z.object({ workspaceId, runId: z.number().int().positive() }).strict(),
    output: reviewResult,
  },
  "review:edit": {
    input: z
      .object({
        workspaceId,
        itemId: z.number().int().positive(),
        front: z.string().max(5000),
        back: z.string().max(5000),
        topic: z.string().max(200).nullable(),
      })
      .strict(),
    output: itemInfo,
  },
  "study:today": {
    input: z.object({ workspaceId, filter: studyFilter.optional() }).strict(),
    output: z.object({
      counts: studyCounts,
      settings: studySettings,
      facets: z.object({
        topics: z.array(facet),
        materials: z.array(facet),
        subtypes: z.array(facet),
        cards: z.number().int(),
        questions: z.number().int(),
      }),
    }),
  },
  "study:next": {
    input: z.object({ workspaceId, filter: studyFilter.optional() }).strict(),
    output: z.object({
      card: z
        .object({
          itemId: z.number().int(),
          subtype: z.string(),
          topic: z.string().nullable(),
          sourceTitle: z.string(),
          sourcePage: z.number().int().nullable(),
          isNew: z.boolean(),
          front: z.array(piece),
          back: z.array(piece),
          previews: z.object({
            "1": z.string(),
            "2": z.string(),
            "3": z.string(),
            "4": z.string(),
          }),
        })
        .nullable(),
      counts: studyCounts,
    }),
  },
  "study:rate": {
    input: z
      .object({
        workspaceId,
        itemId: z.number().int().positive(),
        rating: z.number().int().min(1).max(4),
        durationMs: z.number().int().min(0).max(86_400_000).optional(),
      })
      .strict(),
    output: z.object({}).strict(),
  },
  "study:undo": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({ itemId: z.number().int().nullable() }),
  },
  "study:saveSettings": {
    input: z
      .object({
        workspaceId,
        newPerDay: z.number().int().optional(),
        dailyGoal: z.number().int().optional(),
        desiredRetention: z.number().optional(),
      })
      .strict(),
    output: studySettings,
  },
  "practice:next": {
    input: z
      .object({
        workspaceId,
        filter: studyFilter.optional(),
        redo: z.boolean().optional(),
        exclude: z.array(z.number().int().positive()).max(1000).optional(),
      })
      .strict(),
    output: z.object({
      question: z
        .object({ item: itemInfo, attempts: z.number().int(), lastCorrect: z.boolean().nullable() })
        .nullable(),
      counts: practiceCounts,
    }),
  },
  "practice:answer": {
    input: z
      .object({
        workspaceId,
        itemId: z.number().int().positive(),
        answer: z.string().max(8),
        seconds: z.number().min(0).max(86_400).optional(),
      })
      .strict(),
    output: z.object({
      correct: z.boolean(),
      answer: z.string(),
      correctKey: z.string(),
      explanation: z.string(),
      options: z.array(z.object({ key: z.string(), text: z.string(), why: z.string() })),
      attemptId: z.number().int(),
    }),
  },
  "practice:counts": {
    input: z.object({ workspaceId, filter: studyFilter.optional() }).strict(),
    output: practiceCounts,
  },
  "errors:list": {
    input: z.object({ workspaceId, topicId: z.number().int().positive().optional() }).strict(),
    output: z.object({
      entries: z.array(errorEntry),
      counts: z.object({
        total: z.number().int(),
        fromQuestions: z.number().int(),
        failedCards: z.number().int(),
      }),
      topics: z.array(topicInfo),
    }),
  },
  "errors:makeCard": {
    input: z.object({ workspaceId, questionId: z.number().int().positive() }).strict(),
    output: z.object({ itemId: z.number().int(), created: z.boolean() }),
  },
  "topics:list": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({ topics: z.array(topicInfo) }),
  },
  "topics:rename": {
    input: z
      .object({ workspaceId, topicId: z.number().int().positive(), name: z.string().max(200) })
      .strict(),
    output: topicInfo,
  },
  "topics:merge": {
    input: z
      .object({
        workspaceId,
        sourceId: z.number().int().positive(),
        targetId: z.number().int().positive(),
      })
      .strict(),
    output: topicInfo,
  },
  "topics:delete": {
    input: z.object({ workspaceId, topicId: z.number().int().positive() }).strict(),
    output: z.object({}).strict(),
  },
  "stats:overview": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({
      summary: z.object({
        reviewedToday: z.number().int(),
        answeredToday: z.number().int(),
        activityToday: z.number().int(),
        goal: z.number().int(),
        goalMet: z.boolean(),
        currentStreak: z.number().int(),
        longestStreak: z.number().int(),
        totalReviews: z.number().int(),
        totalAttempts: z.number().int(),
      }),
      topics: z.array(topicStat),
      weakest: z.array(topicStat),
      retention: z.object({
        rate: z.number().nullable(),
        reviews: z.number().int(),
        days: z.array(
          z.object({
            day: z.string(),
            reviews: z.number().int(),
            passes: z.number().int(),
            rate: z.number().nullable(),
          }),
        ),
      }),
      activity: z.array(
        z.object({
          day: z.string(),
          reviews: z.number().int(),
          attempts: z.number().int(),
          total: z.number().int(),
        }),
      ),
    }),
  },
  "workspace:export": {
    input: z.object({ id: z.number().int().positive() }).strict(),
    output: z.object({ cancelled: z.boolean(), path: z.string().nullable() }),
  },
  "workspace:import": {
    input: z.object({}).strict(),
    output: z.object({
      cancelled: z.boolean(),
      workspace: z
        .object({ id: z.number().int(), name: z.string(), createdAt: z.string() })
        .nullable(),
    }),
  },
  "chat:history": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({ messages: z.array(chatReply) }),
  },
  "chat:ask": {
    input: z.object({ workspaceId, question: z.string().max(5000) }).strict(),
    output: chatReply,
  },
  "chat:clear": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({ cleared: z.number().int() }),
  },
  "embeddings:status": {
    input: z.object({ workspaceId }).strict(),
    output: embeddingStatus,
  },
  "embeddings:enable": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({ jobId: z.number().int().nullable() }),
  },
  "embeddings:disable": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({}).strict(),
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
  "settings:testConnection": {
    input: z.object({}).strict(),
    output: z.object({ ok: z.boolean(), message: z.string() }),
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
  "time:state": { input: z.object({ workspaceId }).strict(), output: timeState },
  "time:start": {
    input: z.object({ workspaceId, topicId: z.number().int().positive().optional() }).strict(),
    output: timeState,
  },
  "time:pause": { input: z.object({ workspaceId }).strict(), output: timeState },
  "time:resume": { input: z.object({ workspaceId }).strict(), output: timeState },
  "time:stop": { input: z.object({ workspaceId }).strict(), output: timeState },
  "workspace:delete": {
    input: z.object({ id: workspaceId }).strict(),
    output: z.object({}).strict(),
  },
} as const satisfies Record<ChannelName, { input: z.ZodType; output: z.ZodType }>;

export type Channels = typeof channels;
export type InputOf<C extends ChannelName> = z.infer<Channels[C]["input"]>;
export type OutputOf<C extends ChannelName> = z.infer<Channels[C]["output"]>;
