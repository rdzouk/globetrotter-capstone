"""Add account security and single-use password recovery without altering users."""
from alembic import op
import sqlalchemy as sa

revision = "20260911_recovery"
down_revision = "20260909_google_chat"
branch_labels = None
depends_on = None


def upgrade():
    metadata = sa.MetaData()
    sa.Table("users", metadata, sa.Column("id", sa.Integer, primary_key=True))
    sa.Table("destinations", metadata, sa.Column("id", sa.Integer, primary_key=True))
    sa.Table("destination_publications", metadata,
        sa.Column("destination_id", sa.Integer, sa.ForeignKey("destinations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("active", sa.Boolean, nullable=False),
        sa.Column("description_fr", sa.Text, nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ).create(op.get_bind(), checkfirst=True)
    sa.Table("account_security", metadata,
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("session_version", sa.Integer, nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
    ).create(op.get_bind(), checkfirst=True)
    sa.Table("fare_policies", metadata,
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("data", sa.JSON, nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
    ).create(op.get_bind(), checkfirst=True)
    sa.Table("password_resets", metadata,
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("password_fingerprint", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Index("ix_password_resets_user_id", "user_id"),
        sa.Index("ix_password_resets_expires_at", "expires_at"),
    ).create(op.get_bind(), checkfirst=True)


def downgrade():
    raise RuntimeError("Account recovery security state cannot be downgraded without invalidating all issued sessions.")