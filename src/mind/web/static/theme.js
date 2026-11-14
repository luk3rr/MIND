/*
 * Filename: theme.js
 * Created on: November 14, 2026
 * Author: Lucas Araújo <araujolucas@dcc.ufmg.br>
 */

(function () {
  "use strict";
  var KEY = "mind-theme";
  var root = document.documentElement;
  root.classList.add("js");

  try {
    var saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") {
      root.dataset.theme = saved;
    }
  } catch (error) {
    /* localStorage may be unavailable; the system theme is used. */
  }

  document.addEventListener("DOMContentLoaded", function () {
    var button = document.getElementById("theme-toggle");
    if (!button) {
      return;
    }
    button.addEventListener("click", function () {
      var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      var current = root.dataset.theme || (systemDark ? "dark" : "light");
      var next = current === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try {
        localStorage.setItem(KEY, next);
      } catch (error) {
        /* Ignore: the choice just won't persist. */
      }
    });
  });
})();
