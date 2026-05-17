"""make post_id nullable and add comment like index

Revision ID: 073115762d1e
Revises: 
Create Date: 2026-05-17 09:15:08.151467

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '073115762d1e'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make likes.post_id nullable (was NOT NULL, blocking comment likes)
    with op.batch_alter_table('likes') as batch_op:
        batch_op.alter_column('post_id', existing_type=sa.INTEGER(), nullable=True)

    # Add partial unique index for comment likes (comment_id, fingerprint)
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_comment_fingerprint "
        "ON likes (comment_id, fingerprint) WHERE comment_id IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_comment_fingerprint")

    with op.batch_alter_table('likes') as batch_op:
        batch_op.alter_column('post_id', existing_type=sa.INTEGER(), nullable=False)
