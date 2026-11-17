/*
 * Filename: wordDiff.ts
 * Created on: November 16, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

export interface Segment {
  text: string;
  kind: "same" | "del" | "ins";
}

const tokens = (text: string): string[] => text.split(/(\s+)/).filter((token) => token !== "");

/**
 * The words that stay, go and come between two texts (longest common subsequence of words, with
 * the spaces kept so the text can be put back together).
 */
export function wordDiff(before: string, after: string): Segment[] {
  const a = tokens(before);
  const b = tokens(after);
  const width = b.length + 1;
  // common[i * width + j] is the size of the common part of a[i..] and b[j..].
  const common = new Int32Array((a.length + 1) * width);
  const at = (i: number, j: number): number => common[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      common[i * width + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const out: Segment[] = [];
  const push = (kind: Segment["kind"], text: string | undefined): void => {
    if (text === undefined) return;
    const last = out.at(-1);
    if (last?.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i += 1;
      j += 1;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      push("del", a[i]);
      i += 1;
    } else {
      push("ins", b[j]);
      j += 1;
    }
  }
  for (; i < a.length; i += 1) push("del", a[i]);
  for (; j < b.length; j += 1) push("ins", b[j]);
  return out;
}
