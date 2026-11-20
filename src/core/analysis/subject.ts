/*
 * Filename: subject.ts
 * Created on: November 19, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

export interface SubjectInput {
  title: string;
  subjectUser: string | null;
  subjectInferred: string | null;
}

export interface Subject {
  /** The subject in force: informed, else inferred, else the title. */
  value: string;
  source: "informed" | "inferred" | "title";
  informed: string | null;
  inferred: string | null;
}

const tidy = (text: string | null): string | null => {
  const cleaned = (text ?? "").split(/\s+/).filter(Boolean).join(" ");
  return cleaned || null;
};

/** The subject the prompts name for a material: what the person said, else what was found, else the title. */
export function resolveSubject(input: SubjectInput): Subject {
  const informed = tidy(input.subjectUser);
  const inferred = tidy(input.subjectInferred);
  if (informed) return { value: informed, source: "informed", informed, inferred };
  if (inferred) return { value: inferred, source: "inferred", informed, inferred };
  return { value: input.title, source: "title", informed, inferred };
}
