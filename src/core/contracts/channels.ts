/*
 * Filename: channels.ts
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { z } from "zod";
import type { ChannelName } from "./channel-names.js";

/** Bumped whenever a channel changes in an incompatible way; checked at startup. */
export const CONTRACT_VERSION = 2;

const route = z
  .string()
  .min(1)
  .max(200)
  .regex(/^\/[A-Za-z0-9/_\-.?=&%]*$/, "route must be an absolute in-app path")
  .refine((value) => !value.startsWith("//"), "route must not be protocol-relative");

const workspaceId = z.number().int().positive();
const workspaceName = z.string().max(500);
/** Mix a queue: alternate its topics or materials, continuing after the key of the last item. */
const mixRequest = z
  .object({
    by: z.enum(["topic", "material"]),
    afterKey: z.string().max(40).nullable(),
  })
  .strict();
/** When the answer to a practice question is shown. */
const feedbackMode = z.enum(["immediate", "block", "next_day"]);
const practiceSettings = z.object({
  feedback: feedbackMode,
  confidence: z.boolean(),
  interleave: z.boolean(),
});
/** Where a card or question can be checked in the original PDF (absent when it cannot). */
const pdfSource = z
  .object({ materialId: z.number().int(), page: z.number().int(), quote: z.string() })
  .nullable()
  .optional();
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
      "calculation_4",
      "calculation_5",
    ]),
    quantity: z.number().int().min(1).max(200),
    kind: z.enum(["card", "question"]),
    pageFrom: z.number().int().min(1).optional(),
    pageTo: z.number().int().min(1).optional(),
    /** What the person wants on top of the type (a focus, a style, a constraint). */
    instructions: z.string().max(2000).optional(),
    /** Write variations of the items already approved on this material or topic. */
    variations: z.boolean().optional(),
    /** Puts every item of the run in this topic (created when new) instead of letting the model choose. */
    topicName: z.string().max(200).optional(),
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
  /** Drafts of the run still waiting for review. */
  pending: z.number().int(),
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
  pdfSource,
  edited: z.boolean(),
  origin: z.string(),
  createdAt: z.string(),
  approvedAt: z.string().nullable(),
  options: z.array(z.object({ key: z.string(), text: z.string(), why: z.string() })),
  answer: z.string().nullable(),
});

/** A question as the window sees it before answering: no answer key, comment or quote. */
const questionView = z.object({
  id: z.number().int(),
  statement: z.string(),
  subtype: z.string(),
  topic: z.string().nullable(),
  options: z.array(z.object({ key: z.string(), text: z.string() })),
});

/** What is revealed about an answer once its feedback is released. */
const feedback = z.object({
  attemptId: z.number().int(),
  itemId: z.number().int(),
  statement: z.string(),
  correct: z.boolean(),
  answer: z.string(),
  correctKey: z.string(),
  explanation: z.string(),
  options: z.array(z.object({ key: z.string(), text: z.string(), why: z.string() })),
  confidence: z.number().int().min(1).max(3).nullable(),
  answeredAt: z.string(),
  sourceTitle: z.string(),
  sourcePage: z.number().int().nullable(),
  quote: z.string(),
  pdfSource,
});

/** A card written by hand. Emptiness is checked by the service so each field gets its own message. */
const cardDraft = z
  .object({
    kind: z.literal("card"),
    subtype: z.enum(["qa", "cloze", "compare", "true_false"]),
    front: z.string().max(5000),
    back: z.string().max(5000),
  })
  .strict();

/**
 * A question written by hand. The service checks the cross-field rules (letters, answer, texts)
 * so each field gets its own message; here only the sizes are limited.
 */
const questionDraft = z
  .object({
    kind: z.literal("question"),
    subtype: z.enum(["certo_errado", "multiple_choice"]),
    statement: z.string().max(5000),
    /** Empty for certo_errado; 2 to 5 alternatives (A to E) for multiple_choice. */
    options: z
      .array(
        z
          .object({
            key: z.string().max(2),
            text: z.string().max(2000),
            why: z.string().max(2000),
          })
          .strict(),
      )
      .max(5),
    /** "C" or "E" for certo_errado, an alternative key otherwise. */
    answer: z.string().max(2),
    explanation: z.string().max(2000),
  })
  .strict();

const itemDraft = z.discriminatedUnion("kind", [cardDraft, questionDraft]);

/**
 * Where an item points to. The page is null for materials that have none (text, web pages). The
 * quote is capped at what the PDF reader can highlight (see `reader:locate`).
 */
const sourceIn = z
  .object({
    materialId: z.number().int().positive(),
    page: z.number().int().min(1).nullable(),
    quote: z.string().min(1).max(2000),
  })
  .strict();

/** One row of the preview of an import. */
const previewRow = z.object({
  /** The position in the file, counting the header as line 1. */
  line: z.number().int(),
  status: z.enum(["valid", "error", "duplicate"]),
  /** The front of the card or the statement of the question, cut to 200 characters. */
  text: z.string(),
  topic: z.string().nullable(),
  topicIsNew: z.boolean(),
  /** Why the row is an error or a duplicate, in Portuguese; null for a valid row. */
  problem: z.string().nullable(),
});

const previewTotals = z.object({
  rows: z.number().int(),
  valid: z.number().int(),
  errors: z.number().int(),
  duplicates: z.number().int(),
});

/** A passage selected in the reader and what to write from it; the model decides what is left out. */
const selectionRequest = z
  .object({
    workspaceId,
    materialId: z.number().int().positive(),
    page: z.number().int().min(1).nullable(),
    text: z.string().max(8000),
    kind: z.enum(["card", "question"]),
    quantity: z.number().int().min(1).max(20).optional(),
    subject: z.string().max(200).optional(),
    /** One type for every item; the model chooses per item when absent. */
    subtype: z
      .enum([
        "qa",
        "cloze",
        "compare",
        "true_false",
        "certo_errado",
        "multiple_choice_4",
        "multiple_choice_5",
      ])
      .optional(),
    /** What the person wants in their own words. */
    instructions: z.string().max(1000).optional(),
  })
  .strict();

const selectionEstimate = z.object({
  estimatedUsd: z.number().nullable(),
  chars: z.number().int(),
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

const studyFacets = z.object({
  topics: z.array(facet),
  materials: z.array(facet),
  subtypes: z.array(facet),
  cards: z.number().int(),
  questions: z.number().int(),
});

const studyCounts = z.object({
  learning: z.number().int(),
  review: z.number().int(),
  newAvailable: z.number().int(),
  /** Unseen cards held back today by the daily limit of new cards. */
  newWaiting: z.number().int(),
  reviewedToday: z.number().int(),
  newStudiedToday: z.number().int(),
  toStudy: z.number().int(),
});

const studySettings = z.object({
  newPerDay: z.number().int(),
  dailyGoal: z.number().int(),
  desiredRetention: z.number(),
  maximumInterval: z.number().int(),
  learningSteps: z.string(),
  relearningSteps: z.string(),
  enableFuzz: z.boolean(),
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
  cards: z.number().int(),
  questions: z.number().int(),
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
  pdfSource,
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

const timeSettings = z.object({
  dailyGoalMin: z.number().int().min(0).max(600),
  idleSeconds: z.number().int().min(30).max(600),
  autoEnabled: z.boolean(),
});

const sessionInfo = z.object({
  id: z.number().int(),
  startedAt: z.string(),
  endedAt: z.string(),
  seconds: z.number().int(),
  source: timeSource,
  day: z.string(),
  topicName: z.string().nullable(),
  materialTitle: z.string().nullable(),
});

const timeStats = z.object({
  totalSeconds: z.number().int(),
  avgPerDaySeconds: z.number().int(),
  bestDay: z.object({ day: z.string(), seconds: z.number().int() }).nullable(),
  byDay: z.array(
    z.object({
      day: z.string(),
      cards: z.number().int(),
      practice: z.number().int(),
      reading: z.number().int(),
      manual: z.number().int(),
    }),
  ),
  byTopic: z.array(
    z.object({
      topicId: z.number().int().nullable(),
      name: z.string().nullable(),
      seconds: z.number().int(),
    }),
  ),
  byMaterial: z.array(
    z.object({ materialId: z.number().int(), title: z.string(), seconds: z.number().int() }),
  ),
});

const box = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const readerTarget = { workspaceId, materialId: z.number().int().positive() };

const updateState = z.object({
  enabled: z.boolean(),
  current: z.string(),
  available: z.object({ version: z.string(), url: z.string() }).nullable(),
  checkedAt: z.string().nullable(),
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
      /** Answers whose feedback is ready and not seen yet. */
      pendingFeedback: z.number().int().nonnegative(),
    }),
  },
  "material:list": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({
      materials: z.array(
        materialInfo.extend({
          /** Approved questions of the material never answered in practice: what a pre-test can use. */
          pretestEligible: z.number().int().nonnegative(),
        }),
      ),
    }),
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
  "material:rename": {
    input: z
      .object({ workspaceId, id: z.number().int().positive(), title: z.string().max(1000) })
      .strict(),
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
        /** Questions only: the rewritten options (same letters) and the right answer. */
        options: z
          .array(
            z.object({
              key: z.string().max(2),
              text: z.string().max(2000),
              why: z.string().max(2000),
            }),
          )
          .max(10)
          .optional(),
        answer: z.string().max(2).optional(),
      })
      .strict(),
    output: itemInfo,
  },
  "items:list": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({
      items: z.array(
        z.object({
          id: z.number().int(),
          kind: z.string(),
          subtype: z.string(),
          front: z.string(),
          back: z.string(),
          status: z.string(),
          topicId: z.number().int().nullable(),
          topic: z.string().nullable(),
          materialId: z.number().int().nullable(),
          material: z.string().nullable(),
          edited: z.boolean(),
          createdAt: z.string(),
          /** How the item came to be: generated, manual, reader, import or error_note. */
          origin: z.string(),
          sourceTitle: z.string(),
          sourcePage: z.number().int().nullable(),
          hasPdf: z.boolean(),
        }),
      ),
    }),
  },
  "items:bulk": {
    input: z
      .object({
        workspaceId,
        ids: z.array(z.number().int().positive()).min(1).max(5000),
        action: z.enum(["topic", "discard", "restore", "approve"]),
        /** The topic to give ("topic" action); null or empty removes it. */
        topic: z.string().max(200).nullable().optional(),
      })
      .strict(),
    output: z.object({ changed: z.number().int(), skipped: z.number().int() }),
  },
  "items:create": {
    input: z
      .object({
        workspaceId,
        draft: itemDraft,
        topic: z.string().max(200).nullable().optional(),
        source: sourceIn.optional(),
        origin: z.enum(["manual", "reader"]),
      })
      .strict(),
    output: z.object({
      itemId: z.number().int(),
      topicCreated: z.boolean(),
      /** False when the item has no source or its quote could not be placed in the material. */
      sourceLinked: z.boolean(),
    }),
  },
  "import:template": {
    input: z
      .object({
        workspaceId,
        kind: z.enum(["card", "question"]),
        format: z.enum(["csv", "xlsx"]),
      })
      .strict(),
    /** False when the person cancelled the "save as" dialog. */
    output: z.object({ saved: z.boolean() }),
  },
  "import:preview": {
    input: z.object({ workspaceId, kind: z.enum(["card", "question"]) }).strict(),
    output: z.discriminatedUnion("cancelled", [
      z.object({ cancelled: z.literal(true) }),
      z.object({
        cancelled: z.literal(false),
        /** Identifies the preview that waits for a confirmation; valid for 15 minutes. */
        token: z.string(),
        fileName: z.string(),
        totals: previewTotals,
        /** Topics of the file that do not exist yet and will be created. */
        newTopics: z.array(z.string()),
        /** The first rows; `import:previewRows` returns the others. */
        rows: z.array(previewRow),
        truncated: z.boolean(),
      }),
    ]),
  },
  "import:previewRows": {
    input: z
      .object({
        workspaceId,
        token: z.string().max(100),
        status: z.enum(["all", "valid", "error", "duplicate"]),
        offset: z.number().int().min(0),
        limit: z.number().int().min(1).max(500),
      })
      .strict(),
    output: z.object({ rows: z.array(previewRow), total: z.number().int() }),
  },
  "import:commit": {
    input: z
      .object({
        workspaceId,
        token: z.string().max(100),
        /** Line numbers of the duplicates to import anyway; the other duplicates are left out. */
        includeDuplicates: z.array(z.number().int().min(1)).max(5000),
      })
      .strict(),
    output: z.object({
      imported: z.number().int(),
      skippedDuplicates: z.number().int(),
      skippedErrors: z.number().int(),
      topicsCreated: z.number().int(),
    }),
  },
  "import:discard": {
    input: z.object({ workspaceId, token: z.string().max(100) }).strict(),
    output: z.object({}).strict(),
  },
  "selection:estimate": { input: selectionRequest, output: selectionEstimate },
  "selection:generate": {
    input: selectionRequest,
    output: z.object({
      drafts: z.array(
        z.object({
          draft: itemDraft,
          topic: z.string().nullable(),
          /** The part of the passage that supports the item; becomes its source when saved. */
          quote: z.string(),
        }),
      ),
      discarded: z.object({
        noSource: z.number().int(),
        invalid: z.number().int(),
        duplicate: z.number().int(),
      }),
      costUsd: z.number().nullable(),
    }),
  },
  "assist:improve": {
    input: z
      .object({
        workspaceId,
        action: z.enum(["improve", "fix", "adjust"]),
        /** What the person wants; required for "adjust". */
        instruction: z.string().max(500).optional(),
        draft: itemDraft,
        topic: z.string().max(200).nullable().optional(),
        /** The passage the item is based on, when it has a source. */
        quote: z.string().max(2000).optional(),
      })
      .strict(),
    output: z.object({ proposal: itemDraft, costUsd: z.number().nullable() }),
  },
  "source:resolve": {
    input: z
      .object({
        workspaceId,
        materialId: z.number().int().positive(),
        page: z.number().int().min(1).nullable(),
        text: z.string().min(1).max(8000),
      })
      .strict(),
    output: z.object({
      /** "full": the text is in the material; "partial": only its beginning is; "none": not found. */
      match: z.enum(["full", "partial", "none"]),
      chunkId: z.number().int().nullable(),
      /** The text the item would keep as its quote (the matched part, or the text as given). */
      quote: z.string(),
      materialTitle: z.string(),
    }),
  },
  "review:discardApproved": {
    input: z.object({ workspaceId, itemId: z.number().int().positive() }).strict(),
    output: z.object({ discarded: z.boolean() }),
  },
  "review:restore": {
    input: z.object({ workspaceId, itemId: z.number().int().positive() }).strict(),
    output: z.object({ status: z.enum(["draft", "approved"]).nullable() }),
  },
  "study:today": {
    input: z.object({ workspaceId, filter: studyFilter.optional() }).strict(),
    output: z.object({
      counts: studyCounts,
      settings: studySettings,
      /** What "restore defaults" goes back to. */
      defaults: studySettings,
      facets: studyFacets,
    }),
  },
  "study:next": {
    input: z
      .object({
        workspaceId,
        filter: studyFilter.optional(),
        /** New cards to allow today on top of the daily limit ("study more"). */
        extraNew: z.number().int().min(0).max(500).optional(),
        /** Study the cards that are due later today now, without waiting for their time. */
        early: z.boolean().optional(),
        /** Alternate the topics or materials of the queue instead of studying them in blocks. */
        mix: mixRequest.optional(),
      })
      .strict(),
    output: z.object({
      card: z
        .object({
          itemId: z.number().int(),
          subtype: z.string(),
          topic: z.string().nullable(),
          sourceTitle: z.string(),
          sourcePage: z.number().int().nullable(),
          pdfSource,
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
      /** Cards that come back later today (not due yet): how many and when the first is due. */
      waiting: z.object({ count: z.number().int(), due: z.string() }).nullable(),
      /** The group of the card shown, to send back as `afterKey` in the next call. */
      mixKey: z.string().nullable(),
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
        maximumInterval: z.number().int().optional(),
        learningSteps: z.string().max(80).optional(),
        relearningSteps: z.string().max(80).optional(),
        enableFuzz: z.boolean().optional(),
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
        mix: mixRequest.optional(),
      })
      .strict(),
    output: z.object({
      question: z
        .object({
          item: questionView,
          attempts: z.number().int(),
          lastCorrect: z.boolean().nullable(),
        })
        .nullable(),
      counts: practiceCounts,
      /** The group of the question shown, to send back as `afterKey` in the next call. */
      mixKey: z.string().nullable(),
    }),
  },
  "practice:answer": {
    input: z
      .object({
        workspaceId,
        itemId: z.number().int().positive(),
        answer: z.string().max(8),
        seconds: z.number().min(0).max(86_400).optional(),
        /** How sure the student is: 1 a guess, 2 think so, 3 certain; required when it is asked. */
        confidence: z.number().int().min(1).max(3).optional(),
      })
      .strict(),
    output: z.object({
      attemptId: z.number().int(),
      /** The feedback, or null while it waits for the end of the block. */
      feedback: feedback.nullable(),
      /** When the feedback becomes visible; null while it waits for the end of the block. */
      releaseAt: z.string().nullable(),
    }),
  },
  "practice:releaseAbandoned": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({ released: z.number().int().nonnegative() }),
  },
  "practice:pendingCount": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({ count: z.number().int().nonnegative() }),
  },
  "practice:openFeedback": {
    input: z.object({ workspaceId, limit: z.number().int().min(1).max(200).optional() }).strict(),
    output: z.object({
      entries: z.array(feedback),
      /** Feedback that was ready but did not fit in `limit`. */
      remaining: z.number().int().nonnegative(),
    }),
  },
  "pretest:start": {
    input: z
      .object({ workspaceId, materialId: z.number().int().positive(), count: z.number().int() })
      .strict(),
    output: z.object({
      roundId: z.string().min(1).max(64),
      questions: z.array(questionView),
      available: z.number().int().nonnegative(),
    }),
  },
  "pretest:answer": {
    input: z
      .object({
        workspaceId,
        roundId: z.string().min(1).max(64),
        itemId: z.number().int().positive(),
        answer: z.string().max(8),
        seconds: z.number().min(0).max(86_400).optional(),
        confidence: z.number().int().min(1).max(3).optional(),
      })
      .strict(),
    output: z.object({}).strict(),
  },
  "pretest:summary": {
    input: z.object({ workspaceId, roundId: z.string().min(1).max(64) }).strict(),
    output: z.object({
      total: z.number().int().nonnegative(),
      correct: z.number().int().nonnegative(),
      entries: z.array(feedback),
    }),
  },
  "pretest:history": {
    input: z.object({ workspaceId, materialId: z.number().int().positive() }).strict(),
    output: z.object({
      /** The rounds of the material, newest first. */
      rounds: z.array(
        z.object({
          roundId: z.string().min(1).max(64),
          /** When the round's last answer was given. */
          answeredAt: z.string(),
          total: z.number().int().nonnegative(),
          correct: z.number().int().nonnegative(),
        }),
      ),
    }),
  },
  "practice:releaseBlock": {
    input: z
      .object({ workspaceId, attemptIds: z.array(z.number().int().positive()).min(1).max(100) })
      .strict(),
    output: z.object({ entries: z.array(feedback) }),
  },
  "practice:counts": {
    input: z.object({ workspaceId, filter: studyFilter.optional() }).strict(),
    output: practiceCounts,
  },
  "practice:facets": { input: z.object({ workspaceId }).strict(), output: studyFacets },
  "practice:settings": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({
      settings: practiceSettings,
      /** What "restore defaults" goes back to. */
      defaults: practiceSettings,
    }),
  },
  "practice:saveSettings": {
    input: z
      .object({
        workspaceId,
        feedback: feedbackMode.optional(),
        confidence: z.boolean().optional(),
        interleave: z.boolean().optional(),
      })
      .strict(),
    output: practiceSettings,
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
  "stats:materials": {
    input: z.object({ workspaceId }).strict(),
    output: z.object({
      materials: z.array(
        z.object({
          materialId: z.number().int(),
          title: z.string(),
          created: z.number().int(),
          cards: z.number().int(),
          questions: z.number().int(),
          toReview: z.number().int(),
          approved: z.number().int(),
          discarded: z.number().int(),
          studied: z.number().int(),
          unseen: z.number().int(),
          due: z.number().int(),
          events: z.number().int(),
          accuracy: z.number().nullable(),
          smallSample: z.boolean(),
          focus: z.enum(["due", "weak", "unseen", "review"]).nullable(),
          priority: z.number(),
          suggested: z.boolean(),
        }),
      ),
    }),
  },
  "stats:calibration": {
    input: z.object({ workspaceId, days: z.number().int().min(1).max(365).optional() }).strict(),
    output: z.object({
      /** False until some answer in the window has a confidence. */
      hasData: z.boolean(),
      levels: z
        .array(
          z.object({
            level: z.number().int().min(1).max(3),
            answers: z.number().int().nonnegative(),
            correct: z.number().int().nonnegative(),
            rate: z.number().nullable(),
            flag: z.enum(["overconfident"]).nullable(),
          }),
        )
        .length(3),
      topics: z.array(
        z.object({ topicId: z.number().int(), name: z.string(), confidentWrong: z.number().int() }),
      ),
    }),
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
  "time:activity": {
    input: z
      .object({
        workspaceId,
        source: z.enum(["cards", "practice", "reading"]),
        itemId: z.number().int().positive().optional(),
        materialId: z.number().int().positive().optional(),
      })
      .strict(),
    output: z.object({}).strict(),
  },
  "time:blur": { input: z.object({ workspaceId }).strict(), output: z.object({}).strict() },
  "time:getSettings": { input: z.object({ workspaceId }).strict(), output: timeSettings },
  "time:saveSettings": {
    input: z
      .object({
        workspaceId,
        dailyGoalMin: z.number().int().optional(),
        idleSeconds: z.number().int().optional(),
        autoEnabled: z.boolean().optional(),
      })
      .strict(),
    output: timeSettings,
  },
  "time:stats": {
    input: z.object({ workspaceId, days: z.union([z.literal(7), z.literal(30)]) }).strict(),
    output: timeStats,
  },
  "time:sessions": {
    input: z.object({ workspaceId, limit: z.number().int().min(1).max(200).optional() }).strict(),
    output: z.object({ sessions: z.array(sessionInfo) }),
  },
  "time:deleteSession": {
    input: z.object({ workspaceId, id: z.number().int().positive() }).strict(),
    output: z.object({}).strict(),
  },
  "reader:info": {
    input: z.object(readerTarget).strict(),
    output: z.object({
      title: z.string(),
      pageCount: z.number().int(),
      pages: z.array(z.object({ width: z.number(), height: z.number() })),
      lastPage: z.number().int().nullable(),
    }),
  },
  "reader:page": {
    input: z
      .object({
        ...readerTarget,
        page: z.number().int().min(1),
        scale: z.number().min(0.25).max(4),
      })
      .strict(),
    output: z.object({
      dataUrl: z.string().startsWith("data:image/png;base64,"),
      width: z.number().int(),
      height: z.number().int(),
    }),
  },
  "reader:text": {
    input: z.object({ ...readerTarget, page: z.number().int().min(1) }).strict(),
    output: z.object({
      width: z.number(),
      height: z.number(),
      lines: z.array(box.extend({ text: z.string() })),
    }),
  },
  "reader:search": {
    input: z.object({ ...readerTarget, query: z.string().min(1).max(200) }).strict(),
    output: z.object({
      hits: z.array(z.object({ page: z.number().int(), rects: z.array(box) })),
      truncated: z.boolean(),
    }),
  },
  "reader:openWindow": {
    input: z
      .object({
        ...readerTarget,
        page: z.number().int().min(1).optional(),
        /** Text to highlight on the page, as a card or question cites it. */
        quote: z.string().min(1).max(2000).optional(),
      })
      .strict(),
    output: z.object({}).strict(),
  },
  "material:openOriginal": {
    input: z.object(readerTarget).strict(),
    output: z.object({}).strict(),
  },
  "reader:locate": {
    input: z
      .object({
        ...readerTarget,
        page: z.number().int().min(1),
        quote: z.string().min(1).max(2000),
      })
      .strict(),
    output: z.object({ rects: z.array(box) }),
  },
  "reader:savePosition": {
    input: z.object({ ...readerTarget, page: z.number().int().min(1) }).strict(),
    output: z.object({}).strict(),
  },
  "update:state": { input: z.object({}).strict(), output: updateState },
  "update:check": {
    input: z.object({}).strict(),
    output: z.object({
      outcome: z.enum(["disabled", "current", "available", "error"]),
      state: updateState,
      release: z.object({ version: z.string(), url: z.string() }).nullable(),
    }),
  },
  "update:setEnabled": { input: z.object({ enabled: z.boolean() }).strict(), output: updateState },
  "update:dismiss": {
    input: z.object({ version: z.string().max(32) }).strict(),
    output: updateState,
  },
  "update:openRelease": { input: z.object({}).strict(), output: z.object({}).strict() },
  "workspace:delete": {
    input: z.object({ id: workspaceId }).strict(),
    output: z.object({}).strict(),
  },
} as const satisfies Record<ChannelName, { input: z.ZodType; output: z.ZodType }>;

export type Channels = typeof channels;
export type InputOf<C extends ChannelName> = z.infer<Channels[C]["input"]>;
export type OutputOf<C extends ChannelName> = z.infer<Channels[C]["output"]>;
