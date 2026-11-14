# Filename: __init__.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""Version 1 of the JSON API."""

from fastapi import APIRouter

from mind.api.v1 import jobs, workspaces

router = APIRouter(prefix="/v1")
router.include_router(workspaces.router)
router.include_router(jobs.router)
