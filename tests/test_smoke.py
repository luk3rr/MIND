# Filename: test_smoke.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

import mind


def test_package_has_version() -> None:
    assert mind.__version__ == "0.1.0"
