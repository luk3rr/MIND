# Filename: 0008_material_url_and_run_topic.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""add the source URL of a material and the topic of a training run

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("material") as batch:
        batch.add_column(sa.Column("source_url", sa.String()))
    with op.batch_alter_table("generation_run") as batch:
        batch.add_column(sa.Column("topic_id", sa.Integer()))
        batch.create_foreign_key(
            "fk_generation_run_topic", "topic", ["topic_id"], ["id"], ondelete="SET NULL"
        )


def downgrade() -> None:
    with op.batch_alter_table("generation_run") as batch:
        batch.drop_column("topic_id")
    with op.batch_alter_table("material") as batch:
        batch.drop_column("source_url")
