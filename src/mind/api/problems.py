# Filename: problems.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""RFC 9457 `application/problem+json` error handling for the API."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from mind.api.schemas import FieldErrorOut, Problem
from mind.errors import AppError

PROBLEM_JSON = "application/problem+json"
TYPE_BASE = "https://mind.local/errors/"


def problem_response(
    request: Request,
    *,
    status: int,
    code: str,
    title: str,
    detail: str = "",
    errors: list[FieldErrorOut] | None = None,
) -> JSONResponse:
    problem = Problem(
        type=TYPE_BASE + code.lower().replace("_", "-"),
        title=title,
        status=status,
        code=code,
        detail=detail,
        instance=request.url.path,
        errors=errors or [],
    )
    return JSONResponse(problem.model_dump(), status_code=status, media_type=PROBLEM_JSON)


def install_problem_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return problem_response(
            request,
            status=exc.status,
            code=exc.code,
            title=exc.title,
            detail=exc.detail,
            errors=[FieldErrorOut(field=e.field, message=e.message) for e in exc.errors],
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            FieldErrorOut(field=".".join(str(p) for p in e["loc"][1:]) or "body", message=e["msg"])
            for e in exc.errors()
        ]
        return problem_response(
            request,
            status=422,
            code="VALIDATION_ERROR",
            title="Dados inválidos",
            detail="A requisição contém campos inválidos.",
            errors=errors,
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR"
        title = "Recurso não encontrado" if exc.status_code == 404 else "Erro na requisição"
        return problem_response(
            request, status=exc.status_code, code=code, title=title, detail=str(exc.detail)
        )
