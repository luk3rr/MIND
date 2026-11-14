# Filename: env.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

from alembic import context

from mind.db.migrations._env import run_online

run_online(context.config)
