# Filename: 0005_create_study_tables.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""create the card_state and review_log tables

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "card_state",
        sa.Column(
            "item_id",
            sa.Integer(),
            sa.ForeignKey("item.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("fsrs_json", sa.String(), nullable=False),
        sa.Column("due", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.Integer(), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=False),
        sa.Column("lapses", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_card_state_due", "card_state", ["due"])
    op.create_table(
        "review_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "item_id",
            sa.Integer(),
            sa.ForeignKey("item.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("previous_state_json", sa.String()),
        sa.Column("duration_ms", sa.Integer()),
        sa.Column("day", sa.String(10), nullable=False),
    )
    op.create_index("ix_review_log_day", "review_log", ["day"])


def downgrade() -> None:
    op.drop_index("ix_review_log_day", table_name="review_log")
    op.drop_table("review_log")
    op.drop_index("ix_card_state_due", table_name="card_state")
    op.drop_table("card_state")
