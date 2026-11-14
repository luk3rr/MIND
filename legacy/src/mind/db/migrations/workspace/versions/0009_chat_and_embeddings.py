# Filename: 0009_chat_and_embeddings.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""create the chat history and the optional chunk embeddings

Revision ID: 0009
Revises: 0008
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_message",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("question", sa.String(), nullable=False),
        sa.Column("answer", sa.String(), nullable=False),
        sa.Column("supported", sa.Boolean(), nullable=False),
        sa.Column("citations_json", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("cost_usd", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "chunk_embedding",
        sa.Column(
            "chunk_id",
            sa.Integer(),
            sa.ForeignKey("chunk.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("dim", sa.Integer(), nullable=False),
        sa.Column("vector", sa.LargeBinary(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("chunk_embedding")
    op.drop_table("chat_message")
