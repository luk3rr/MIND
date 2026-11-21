/*
 * Filename: refs.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { z } from "zod";

/** A SHA-256 in lowercase hex: the name of an image file and the key of its row. */
export const imageHash = z.string().regex(/^[0-9a-f]{64}$/);

/**
 * What an item keeps of an image: the stored file, the original when the stored one was cut or
 * rotated, and a short description shown when the picture is not there.
 */
export const imageRef = z
  .object({
    hash: imageHash,
    source: imageHash.optional(),
    alt: z.string().max(300).optional(),
  })
  .strict();

export type ImageRef = z.infer<typeof imageRef>;

/** The fields of an item that may carry images. */
export const IMAGE_FIELDS = [
  "front",
  "back",
  "statement",
  "explanation",
  "option.A",
  "option.B",
  "option.C",
  "option.D",
  "option.E",
] as const;

export type ImageField = (typeof IMAGE_FIELDS)[number];

/** A defence against absurd payloads; the rule for the person is "no limit" (FR-2). */
export const MAX_IMAGES_PER_FIELD = 200;

/** The images of an item by field, in display order. A missing or empty field has none. */
export const itemImages = z.partialRecord(
  z.enum(IMAGE_FIELDS),
  z.array(imageRef).max(MAX_IMAGES_PER_FIELD),
);

export type ItemImages = z.infer<typeof itemImages>;

/** Every hash an `images` map points to, including the originals of adjusted images. */
export function hashesOf(images: ItemImages | undefined): string[] {
  if (!images) return [];
  const found = new Set<string>();
  for (const refs of Object.values(images)) {
    for (const ref of refs ?? []) {
      found.add(ref.hash);
      if (ref.source) found.add(ref.source);
    }
  }
  return [...found];
}

/** The map without empty fields, or undefined when nothing is left. */
export function cleanImages(images: ItemImages | undefined): ItemImages | undefined {
  if (!images) return undefined;
  const kept = Object.fromEntries(
    Object.entries(images).filter(([, refs]) => (refs?.length ?? 0) > 0),
  ) as ItemImages;
  return Object.keys(kept).length > 0 ? kept : undefined;
}

/** True when `field` of the item carries at least one picture. */
export function hasImages(images: ItemImages | undefined, field: string): boolean {
  return ((images as Record<string, unknown[]> | undefined)?.[field]?.length ?? 0) > 0;
}

/**
 * The text a rule that asks for "something in the field" should see: the text itself, or a
 * stand-in when the field is only a picture (a field may be just an image, FR-3).
 */
export function textOrImage(text: string, images: ItemImages | undefined, field: string): string {
  return text.trim() === "" && hasImages(images, field) ? "[imagem]" : text;
}

/** The pictures that may be shown before a question is answered: its statement and options. */
export function beforeAnswer(images: ItemImages | undefined): ItemImages | undefined {
  if (!images) return undefined;
  const kept = Object.fromEntries(
    Object.entries(images).filter(
      ([field]) => field === "statement" || field.startsWith("option."),
    ),
  ) as ItemImages;
  return cleanImages(kept);
}

/** The pictures of one field by its name, which may be built at run time (`option.B`). */
export function imagesFor(images: ItemImages | undefined, field: string): ImageRef[] | undefined {
  return (images as Record<string, ImageRef[] | undefined> | undefined)?.[field];
}
