# Filename: 0004_create_generation_tables.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""create the topic, generation_run and item tables

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "topic",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(80), nullable=False, unique=True),
    )
    op.create_table(
        "generation_run",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("subtype", sa.String(24), nullable=False),
        sa.Column("material_id", sa.Integer(), sa.ForeignKey("material.id", ondelete="SET NULL")),
        sa.Column("page_from", sa.Integer()),
        sa.Column("page_to", sa.Integer()),
        sa.Column("model", sa.String(128), nullable=False),
        sa.Column("requested", sa.Integer(), nullable=False),
        sa.Column("generated", sa.Integer(), nullable=False),
        sa.Column("discarded_no_source", sa.Integer(), nullable=False),
        sa.Column("discarded_invalid", sa.Integer(), nullable=False),
        sa.Column("discarded_duplicate", sa.Integer(), nullable=False),
        sa.Column("approved", sa.Integer(), nullable=False),
        sa.Column("approved_unedited", sa.Integer(), nullable=False),
        sa.Column("discarded_review", sa.Integer(), nullable=False),
        sa.Column("cost_usd", sa.Float(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("discard_log", sa.String(), nullable=False),
        sa.Column("error_code", sa.String(64)),
        sa.Column("error_detail", sa.String()),
        sa.Column("job_id", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "item",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "run_id",
            sa.Integer(),
            sa.ForeignKey("generation_run.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("subtype", sa.String(24), nullable=False),
        sa.Column("payload_json", sa.String(), nullable=False),
        sa.Column("payload_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("topic.id", ondelete="SET NULL")),
        sa.Column("chunk_id", sa.Integer(), sa.ForeignKey("chunk.id", ondelete="SET NULL")),
        sa.Column("source_title", sa.String(255), nullable=False),
        sa.Column("source_page", sa.Integer()),
        sa.Column("quote", sa.String(), nullable=False),
        sa.Column("edited", sa.Boolean(), nullable=False),
        sa.Column("origin", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_item_run_status", "item", ["run_id", "status"])
    op.create_index("ix_item_status_kind", "item", ["status", "kind"])


def downgrade() -> None:
    op.drop_index("ix_item_status_kind", table_name="item")
    op.drop_index("ix_item_run_status", table_name="item")
    op.drop_table("item")
    op.drop_table("generation_run")
    op.drop_table("topic")
