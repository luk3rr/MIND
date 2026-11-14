# Filename: security.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Host and origin validation plus security headers for the local server."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.responses import PlainTextResponse, Response
from starlette.middleware.trustedhost import TrustedHostMiddleware

from mind.config import Settings

CSP = (
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
    "font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; "
    "frame-ancestors 'none'"
)
# Swagger UI sets inline styles, so only the API docs page relaxes `style-src`.
DOCS_CSP = CSP.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
LOOPBACK_HOSTS = ["127.0.0.1", "localhost"]
WILDCARD_BINDS = {"0.0.0.0", "::"}  # noqa: S104


def allowed_hosts(settings: Settings) -> list[str]:
    """Hosts accepted in the `Host` header (guards against DNS rebinding)."""
    if settings.host in WILDCARD_BINDS:
        return ["*"]
    return [*LOOPBACK_HOSTS, settings.host]


def install_security(app: FastAPI, settings: Settings) -> None:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=allowed_hosts(settings))

    @app.middleware("http")
    async def origin_and_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        origin = request.headers.get("origin")
        if request.method not in SAFE_METHODS and origin is not None:
            host = request.headers.get("host", "")
            if urlsplit(origin).netloc != host:
                return PlainTextResponse("Origem não permitida.", status_code=403)
        response = await call_next(request)
        csp = DOCS_CSP if request.url.path == "/api/docs" else CSP
        response.headers["Content-Security-Policy"] = csp
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response
