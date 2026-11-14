/*
 * Filename: study.js
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 *
 * Keyboard shortcuts and answer reveal for the study screen.
 * Space reveals, 1-4 rate, Z undoes. The same actions are available as buttons.
 */

(function () {
  "use strict";

  var startedAt = 0;

  function card() {
    return document.getElementById("study-card");
  }

  function isRevealed() {
    var back = document.getElementById("study-back");
    return !!back && !back.hidden;
  }

  function reveal() {
    var back = document.getElementById("study-back");
    var button = document.getElementById("reveal");
    var form = document.getElementById("rate-form");
    if (!back || isRevealed()) {
      return;
    }
    back.hidden = false;
    if (form) {
      form.hidden = false;
    }
    if (button) {
      button.hidden = true;
    }
    var first = form && form.querySelector("button[name=rating][value='3']");
    if (first) {
      first.focus();
    }
  }

  function prepare() {
    var current = card();
    if (!current || !document.getElementById("rate-form")) {
      return;
    }
    startedAt = Date.now();
    var form = document.getElementById("rate-form");
    form.hidden = true;
    var button = document.getElementById("reveal");
    if (button) {
      button.addEventListener("click", reveal);
    }
    var back = document.getElementById("study-back");
    if (back) {
      back.hidden = true;
    }
  }

  document.addEventListener("keydown", function (event) {
    var target = event.target;
    var tag = target && target.tagName ? target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select" || event.ctrlKey || event.metaKey) {
      return;
    }
    if (!card()) {
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      reveal();
    } else if (event.key >= "1" && event.key <= "4" && isRevealed()) {
      var button = document.querySelector("#rate-form button[name=rating][value='" + event.key + "']");
      if (button) {
        event.preventDefault();
        button.click();
      }
    } else if (event.key === "z" || event.key === "Z") {
      var undo = document.getElementById("undo");
      if (undo) {
        event.preventDefault();
        undo.click();
      }
    }
  });

  document.addEventListener("htmx:configRequest", function (event) {
    if (event.detail.path && event.detail.path.indexOf("/study/rate") !== -1) {
      event.detail.parameters.elapsed_ms = String(Math.max(Date.now() - startedAt, 0));
    }
  });

  document.addEventListener("DOMContentLoaded", prepare);
  document.addEventListener("htmx:afterSwap", prepare);
})();
