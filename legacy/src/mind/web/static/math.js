/*
 * Filename: math.js
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 *
 * Renders $...$ (inline) and $$...$$ (display) formulas inside [data-math]
 * elements with KaTeX. Invalid formulas fall back to the raw text.
 */

(function () {
  "use strict";

  var PATTERN = /(\$\$[\s\S]+?\$\$|\$(?=\S)[^$\n]*?\S\$(?!\d)|\$\S\$(?!\d))/g;

  /** Split text into {type: "text" | "inline" | "display", value} parts. */
  function splitMath(text) {
    var parts = [];
    var last = 0;
    var match;
    PATTERN.lastIndex = 0;
    while ((match = PATTERN.exec(text)) !== null) {
      if (match.index > last) {
        parts.push({ type: "text", value: text.slice(last, match.index) });
      }
      var raw = match[0];
      if (raw.indexOf("$$") === 0) {
        parts.push({ type: "display", value: raw.slice(2, -2), raw: raw });
      } else {
        parts.push({ type: "inline", value: raw.slice(1, -1), raw: raw });
      }
      last = match.index + raw.length;
    }
    if (last < text.length) {
      parts.push({ type: "text", value: text.slice(last) });
    }
    return parts;
  }

  function renderElement(element) {
    var parts = splitMath(element.textContent || "");
    element.textContent = "";
    parts.forEach(function (part) {
      if (part.type === "text") {
        element.appendChild(document.createTextNode(part.value));
        return;
      }
      var span = document.createElement("span");
      try {
        window.katex.render(part.value, span, {
          displayMode: part.type === "display",
          throwOnError: true,
        });
      } catch (error) {
        span.className = "math-error";
        span.textContent = part.raw;
      }
      element.appendChild(span);
    });
    element.dataset.mathDone = "";
  }

  function renderAll(root) {
    if (!window.katex) {
      return;
    }
    root.querySelectorAll("[data-math]:not([data-math-done])").forEach(renderElement);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { splitMath: splitMath };
    return;
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderAll(document);
  });
  document.addEventListener("htmx:afterSwap", function (event) {
    renderAll(event.target);
  });
})();
