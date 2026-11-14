# Filename: 0003_create_material_chunk_fts.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""create the material and chunk tables and the chunk_fts full-text index

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "material",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("stored_path", sa.String(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("page_count", sa.Integer()),
        sa.Column("char_count", sa.Integer()),
        sa.Column("ocr_confidence", sa.Float()),
        sa.Column("job_id", sa.Integer()),
        sa.Column("error_code", sa.String(64)),
        sa.Column("error_detail", sa.String()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "chunk",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "material_id",
            sa.Integer(),
            sa.ForeignKey("material.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        sa.Column("page", sa.Integer()),
        sa.Column("section", sa.String()),
        sa.Column("text", sa.String(), nullable=False),
    )
    op.create_index("ix_chunk_material_page", "chunk", ["material_id", "page", "ordinal"])
    op.execute(
        "CREATE VIRTUAL TABLE chunk_fts USING fts5("
        "text, content='chunk', content_rowid='id', tokenize='unicode61 remove_diacritics 2')"
    )
    op.execute(
        "CREATE TRIGGER chunk_ai AFTER INSERT ON chunk BEGIN "
        "INSERT INTO chunk_fts(rowid, text) VALUES (new.id, new.text); END"
    )
    op.execute(
        "CREATE TRIGGER chunk_ad AFTER DELETE ON chunk BEGIN "
        "INSERT INTO chunk_fts(chunk_fts, rowid, text) VALUES ('delete', old.id, old.text); END"
    )
    op.execute(
        "CREATE TRIGGER chunk_au AFTER UPDATE ON chunk BEGIN "
        "INSERT INTO chunk_fts(chunk_fts, rowid, text) VALUES ('delete', old.id, old.text); "
        "INSERT INTO chunk_fts(rowid, text) VALUES (new.id, new.text); END"
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER chunk_au")
    op.execute("DROP TRIGGER chunk_ad")
    op.execute("DROP TRIGGER chunk_ai")
    op.execute("DROP TABLE chunk_fts")
    op.drop_index("ix_chunk_material_page", table_name="chunk")
    op.drop_table("chunk")
    op.drop_table("material")
