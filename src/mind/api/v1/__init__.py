# Filename: __init__.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Version 1 of the JSON API."""

from fastapi import APIRouter

from mind.api.v1 import (
    backup,
    chat,
    costs,
    errors,
    generations,
    items,
    jobs,
    materials,
    practice,
    settings,
    stats,
    study,
    topics,
    workspaces,
)

router = APIRouter(prefix="/v1")
router.include_router(workspaces.router)
router.include_router(backup.router)
router.include_router(jobs.router)
router.include_router(materials.router)
router.include_router(generations.router)
router.include_router(items.router)
router.include_router(study.router)
router.include_router(practice.router)
router.include_router(errors.router)
router.include_router(stats.router)
router.include_router(chat.router)
router.include_router(topics.router)
router.include_router(settings.router)
router.include_router(costs.router)
