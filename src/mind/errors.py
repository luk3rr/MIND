# Filename: errors.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Application errors with stable codes (`problem+json` model, see design section 2.8)."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class FieldError:
    field: str
    message: str


class AppError(Exception):
    """Domain error with a stable code, an HTTP status and a pt-BR message."""

    code = "INTERNAL_ERROR"
    status = 500
    title = "Erro interno"

    def __init__(self, detail: str = "", *, errors: list[FieldError] | None = None) -> None:
        super().__init__(detail or self.title)
        self.detail = detail
        self.errors: list[FieldError] = errors or []


class ValidationFailed(AppError):
    code = "VALIDATION_ERROR"
    status = 422
    title = "Dados inválidos"


class WorkspaceNotFound(AppError):
    code = "WORKSPACE_NOT_FOUND"
    status = 404
    title = "Workspace não encontrado"


class JobNotFound(AppError):
    code = "JOB_NOT_FOUND"
    status = 404
    title = "Tarefa não encontrada"


class ProviderKeyMissing(AppError):
    code = "PROVIDER_KEY_MISSING"
    status = 409
    title = "Chave de API não configurada"


class ConsentRequired(AppError):
    code = "CONSENT_REQUIRED"
    status = 409
    title = "É preciso aceitar o envio de trechos ao provedor"


class MonthlyLimitReached(AppError):
    code = "MONTHLY_LIMIT_REACHED"
    status = 402
    title = "Limite mensal de custo atingido"


class ProviderError(AppError):
    code = "PROVIDER_ERROR"
    status = 502
    title = "Falha do provedor de IA"


class UnsupportedFile(AppError):
    code = "UNSUPPORTED_FILE"
    status = 415
    title = "Arquivo não suportado"


class ExtractionFailed(AppError):
    code = "EXTRACTION_FAILED"
    status = 422
    title = "Não foi possível ler o arquivo"


class OcrUnavailable(ExtractionFailed):
    code = "OCR_UNAVAILABLE"
    status = 424
    title = "OCR indisponível"


class MaterialNotFound(AppError):
    code = "MATERIAL_NOT_FOUND"
    status = 404
    title = "Material não encontrado"


class ItemNotFound(AppError):
    code = "ITEM_NOT_FOUND"
    status = 404
    title = "Item não encontrado"


class TopicNotFound(AppError):
    code = "TOPIC_NOT_FOUND"
    status = 404
    title = "Tópico não encontrado"


class GenerationRunNotFound(AppError):
    code = "RUN_NOT_FOUND"
    status = 404
    title = "Geração não encontrada"


class JobNotActive(AppError):
    code = "JOB_NOT_ACTIVE"
    status = 409
    title = "A tarefa não está em execução"


@dataclass(frozen=True)
class ErrorInfo:
    """Serializable representation of an `AppError`."""

    code: str
    status: int
    title: str
    detail: str
    errors: list[FieldError] = field(default_factory=list)

    @classmethod
    def from_error(cls, error: AppError) -> ErrorInfo:
        return cls(error.code, error.status, error.title, error.detail, list(error.errors))
