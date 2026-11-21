/*
 * Filename: components/ItemImageList.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ImageRef } from "../../../core/images/refs.js";
import { T } from "../strings.js";
import { Lightbox } from "./Lightbox.js";

type Loaded = { status: "loading" } | { status: "ready"; dataUrl: string } | { status: "missing" };

/** One stored picture of an item, read through the core (the window never sees a path). */
export function ItemImage({
  workspaceId,
  image,
  thumb = false,
  onZoom,
}: {
  workspaceId: number;
  image: ImageRef;
  thumb?: boolean;
  /** When given, the picture can be enlarged: a click on it or its button calls this. */
  onZoom?: () => void;
}): ReactNode {
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const anchor = useRef<HTMLSpanElement>(null);
  // The picture is read only when it is about to be seen (NFR-3); without the observer (old
  // engines, tests) it is read at once.
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const node = anchor.current;
    if (near || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);
  useEffect(() => {
    if (!near) return;
    let current = true;
    setLoaded({ status: "loading" });
    void window.mind.invoke("image:get", { workspaceId, hash: image.hash }).then((result) => {
      if (!current) return;
      setLoaded(
        result.ok ? { status: "ready", dataUrl: result.data.dataUrl } : { status: "missing" },
      );
    });
    return () => {
      current = false;
    };
  }, [workspaceId, image.hash, near]);

  if (loaded.status === "loading") {
    return (
      <span ref={anchor} className="muted">
        {T.imageLoading}
      </span>
    );
  }
  if (loaded.status === "missing") {
    return (
      <span className="item-image-missing" role="img" aria-label={image.alt ?? T.imageMissing}>
        {image.alt ? `${image.alt} — ` : ""}
        {T.imageMissing}
      </span>
    );
  }
  const picture = (
    <img
      className={thumb ? "item-image thumb" : "item-image"}
      src={loaded.dataUrl}
      alt={image.alt ?? T.imageDefaultAlt}
      {...(onZoom ? { onClick: onZoom, style: { cursor: "zoom-in" } } : {})}
    />
  );
  if (!onZoom) return picture;
  // The button is a sibling, not a wrapper: the picture stays an image for assistive tools.
  return (
    <span className="image-zoom-wrap">
      {picture}
      <button
        type="button"
        className="image-zoom"
        aria-label={T.imageZoom(image.alt ?? T.imageDefaultAlt)}
        onClick={onZoom}
      >
        ⤢
      </button>
    </span>
  );
}

/** The pictures of one field of an item, in order; nothing when the field has none. */
export function ItemImageList({
  workspaceId,
  images,
  zoom = true,
}: {
  workspaceId: number;
  images: readonly ImageRef[] | undefined;
  /** False where a picture sits inside a control that is already a button (an alternative). */
  zoom?: boolean;
}): ReactNode {
  const [zoomed, setZoomed] = useState<ImageRef | null>(null);
  if (!images || images.length === 0) return null;
  return (
    <div className="image-list" role="group" aria-label={T.imageListLabel}>
      {images.map((image, index) => (
        <ItemImage
          key={`${image.hash}-${index}`}
          workspaceId={workspaceId}
          image={image}
          {...(zoom ? { onZoom: () => setZoomed(image) } : {})}
        />
      ))}
      {zoomed && (
        <Lightbox workspaceId={workspaceId} image={zoomed} onClose={() => setZoomed(null)} />
      )}
    </div>
  );
}
