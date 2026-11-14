/*
 * Filename: practice.js
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 *
 * Timer and keyboard shortcuts for the question practice screen.
 * A-E (or C and E for right/wrong) choose, Enter answers, N opens the next question.
 */

(function () {
  "use strict";

  var startedAt = Date.now();

  function reset() {
    startedAt = Date.now();
  }

  document.addEventListener("keydown", function (event) {
    var target = event.target;
    var tag = target && target.tagName ? target.tagName.toLowerCase() : "";
    if (tag === "textarea" || (tag === "input" && target.type !== "radio") || tag === "select") {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    var key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
    var next = document.getElementById("next-question");
    if (next && (key === "N" || key === "Enter")) {
      event.preventDefault();
      next.click();
      return;
    }
    var form = document.getElementById("answer-form");
    if (!form) {
      return;
    }
    var radio = form.querySelector("input[type=radio][value='" + key + "']");
    if (radio) {
      event.preventDefault();
      radio.checked = true;
      radio.focus();
    } else if (key === "Enter" && form.querySelector("input[type=radio]:checked")) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  document.addEventListener("htmx:configRequest", function (event) {
    if (event.detail.path && event.detail.path.indexOf("/practice/answer") !== -1) {
      event.detail.parameters.seconds = String(Math.max((Date.now() - startedAt) / 1000, 0));
    }
  });

  document.addEventListener("htmx:afterSwap", reset);
})();
