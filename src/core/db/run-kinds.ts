/*
 * Filename: run-kinds.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

/**
 * Kinds of `generation_run` rows that hold items created without a model generation (the error
 * notebook, items written by hand, taken from the reader or imported from a spreadsheet). They
 * only exist to satisfy `item.run_id` and never show up in the list of generations.
 */
export const SYNTHETIC_RUN_KINDS = ["notebook", "manual", "reader", "import"] as const;
