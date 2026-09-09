"""Google identities, community chat, and destination comments.

Revision ID: 20260909_google_chat
Revises: 29467b508f5e
"""
from alembic import op
import sqlalchemy as sa

revision = "20260909_google_chat"
down_revision = "29467b508f5e"
branch_labels = None
depends_on = None


def upgrade():
    metadata = sa.MetaData()
    sa.Table("users", metadata, sa.Column("id", sa.Integer, primary_key=True))
    sa.Table("destinations", metadata, sa.Column("id", sa.Integer, primary_key=True))
    comments = sa.Table(
        "comments", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("place_id", sa.Integer, sa.ForeignKey("destinations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("parent_comment_id", sa.Integer, sa.ForeignKey("comments.id", ondelete="CASCADE")),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Index("ix_comments_place_id", "place_id"),
        sa.Index("ix_comments_parent_comment_id", "parent_comment_id"),
        sa.Index("ix_comments_created_at", "created_at"),
    )
    google = sa.Table(
        "google_identities", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("subject", sa.String(255), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    messages = sa.Table(
        "chat_messages", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reply_to_id", sa.Integer, sa.ForeignKey("chat_messages.id", ondelete="SET NULL")),
        sa.Column("client_id", sa.String(36), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("deleted", sa.Boolean, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "client_id", name="uq_chat_user_client"),
        sa.Index("ix_chat_messages_user_id", "user_id"),
    )
    for table in (comments, google, messages):
        table.create(op.get_bind(), checkfirst=True)


def downgrade():
    op.drop_table("chat_messages")
    op.drop_table("google_identities")