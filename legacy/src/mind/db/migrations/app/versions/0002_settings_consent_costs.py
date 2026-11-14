# Filename: 0002_settings_consent_costs.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""create the setting, consent, cost_ledger and model_price tables

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "setting",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", sa.String(), nullable=False),
    )
    op.create_table(
        "consent",
        sa.Column("provider", sa.String(64), primary_key=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "cost_ledger",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("model", sa.String(128), nullable=False),
        sa.Column("purpose", sa.String(64), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False),
        sa.Column("completion_tokens", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=False),
    )
    op.create_index("ix_cost_ledger_at", "cost_ledger", ["at"])
    op.create_table(
        "model_price",
        sa.Column("model", sa.String(128), primary_key=True),
        sa.Column("prompt_usd_per_token", sa.Float(), nullable=False),
        sa.Column("completion_usd_per_token", sa.Float(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("model_price")
    op.drop_index("ix_cost_ledger_at", table_name="cost_ledger")
    op.drop_table("cost_ledger")
    op.drop_table("consent")
    op.drop_table("setting")
