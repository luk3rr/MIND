# Filename: 0007_item_origin_item.py
# Created on: November 14, 2026
# Author: Lucas Araújo <araujolucas@dcc.ufmg.br>

"""link an error card to the question it came from

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("item") as batch:
        batch.add_column(sa.Column("origin_item_id", sa.Integer()))
        batch.create_index("ix_item_origin_item_id", ["origin_item_id"])


def downgrade() -> None:
    with op.batch_alter_table("item") as batch:
        batch.drop_index("ix_item_origin_item_id")
        batch.drop_column("origin_item_id")
