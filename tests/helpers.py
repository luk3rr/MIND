# Filename: helpers.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Small helpers shared by the tests."""

from __future__ import annotations

import time
from collections.abc import Callable


def wait_for(check: Callable[[], bool], seconds: float = 8.0) -> None:
    """Poll `check` until it is true, failing the test after `seconds`."""
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if check():
            return
        time.sleep(0.05)
    raise AssertionError("condition not reached in time")
