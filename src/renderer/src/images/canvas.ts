/*
 * Filename: canvas.ts
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { keptBox, turnedSize } from "./transform.js";
import type { Adjust } from "./transform.js";

function load(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image could not be decoded"));
    image.src = dataUrl;
  });
}

/**
 * Draws the picture turned and cut as the person asked and returns it as PNG bytes. Only the
 * first frame of an animated GIF is drawn. The core checks the result like any other file.
 */
export async function adjustToPng(
  dataUrl: string,
  adjust: Adjust,
): Promise<Uint8Array<ArrayBuffer>> {
  const image = await load(dataUrl);
  const turned = turnedSize(image.naturalWidth, image.naturalHeight, adjust.rotation);
  const box = keptBox(image.naturalWidth, image.naturalHeight, adjust);
  const canvas = document.createElement("canvas");
  canvas.width = box.width;
  canvas.height = box.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas is not available");
  context.translate(-box.x, -box.y);
  if (adjust.rotation === 90) context.translate(turned.width, 0);
  if (adjust.rotation === 180) context.translate(turned.width, turned.height);
  if (adjust.rotation === 270) context.translate(0, turned.height);
  context.rotate((adjust.rotation * Math.PI) / 180);
  context.drawImage(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("the picture could not be encoded");
  return new Uint8Array(await blob.arrayBuffer());
}
