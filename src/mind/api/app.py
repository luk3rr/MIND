# Filename: app.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""The mounted FastAPI sub-application that serves `/api`."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import HTMLResponse

from mind import __version__
from mind.api.problems import install_problem_handlers
from mind.api.v1 import router as v1_router

DOCS_PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MIND API</title>
  <link rel="stylesheet" href="/static/vendor/swagger/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/static/vendor/swagger/swagger-ui-bundle.js"></script>
  <script src="/static/swagger-init.js"></script>
</body>
</html>
"""


def create_api_app() -> FastAPI:
    api = FastAPI(
        title="MIND API",
        version=__version__,
        summary="Local JSON API of MIND (v1).",
        docs_url=None,
        redoc_url=None,
        openapi_url="/openapi.json",
    )
    install_problem_handlers(api)
    api.include_router(v1_router)

    @api.get("/docs", include_in_schema=False, response_class=HTMLResponse)
    async def docs() -> HTMLResponse:
        return HTMLResponse(DOCS_PAGE)

    return api
