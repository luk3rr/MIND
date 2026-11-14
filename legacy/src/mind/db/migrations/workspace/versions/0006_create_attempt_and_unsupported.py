# Filename: 0006_create_attempt_and_unsupported.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""create the attempt table and count questions the judge rejected

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("generation_run") as batch:
        batch.add_column(
            sa.Column("discarded_unsupported", sa.Integer(), nullable=False, server_default="0")
        )
    op.create_table(
        "attempt",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "item_id",
            sa.Integer(),
            sa.ForeignKey("item.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("answer", sa.String(8), nullable=False),
        sa.Column("correct", sa.Boolean(), nullable=False),
        sa.Column("seconds", sa.Float()),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("day", sa.String(10), nullable=False),
    )
    op.create_index("ix_attempt_item_answered", "attempt", ["item_id", "answered_at"])
    op.create_index("ix_attempt_day", "attempt", ["day"])


def downgrade() -> None:
    op.drop_index("ix_attempt_day", table_name="attempt")
    op.drop_index("ix_attempt_item_answered", table_name="attempt")
    op.drop_table("attempt")
    with op.batch_alter_table("generation_run") as batch:
        batch.drop_column("discarded_unsupported")
