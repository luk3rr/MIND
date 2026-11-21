/*
 * Filename: components/Lightbox.tsx
 * Created on: November 21, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ImageRef } from "../../../core/images/refs.js";
import { T } from "../strings.js";
import { Dialog } from "./Dialog.js";
import { ItemImage } from "./ItemImageList.js";

/** A picture at full size over the screen: Esc, a click outside or the button close it. */
export function Lightbox({
  workspaceId,
  image,
  onClose,
}: {
  workspaceId: number;
  image: ImageRef;
  onClose: () => void;
}): ReactNode {
  return createPortal(
    <Dialog title={image.alt ?? T.imageDefaultAlt} onClose={onClose} wide>
      <div className="lightbox-body">
        <ItemImage workspaceId={workspaceId} image={image} />
      </div>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          {T.imageZoomClose}
        </button>
      </div>
    </Dialog>,
    document.body,
  );
}
