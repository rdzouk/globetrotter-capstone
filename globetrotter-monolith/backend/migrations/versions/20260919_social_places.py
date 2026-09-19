"""Add friendships, private voice messages and attributed place contributions."""
from alembic import op
import sqlalchemy as sa


revision = "20260919_social_places"
down_revision = "20260911_recovery"
branch_labels = None
depends_on = None


def upgrade():
    metadata = sa.MetaData()
    sa.Table("users", metadata, sa.Column("id", sa.Integer, primary_key=True))
    sa.Table("destinations", metadata, sa.Column("id", sa.Integer, primary_key=True))
    sa.Table("friendships", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("lower_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("higher_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("requested_by", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("accepted", sa.Boolean, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("lower_user_id", "higher_user_id", name="uq_friendship_pair"),
        sa.CheckConstraint("lower_user_id < higher_user_id", name="ck_friendship_order"),
        sa.CheckConstraint("requested_by IN (lower_user_id, higher_user_id)", name="ck_friendship_requester"),
        sa.Index("ix_friendships_lower_user_id", "lower_user_id"),
        sa.Index("ix_friendships_higher_user_id", "higher_user_id"),
    ).create(op.get_bind(), checkfirst=True)
    sa.Table("direct_messages", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("friendship_id", sa.Integer, sa.ForeignKey("friendships.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.String(36), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("audio", sa.LargeBinary),
        sa.Column("audio_type", sa.String(80)),
        sa.Column("duration", sa.Float),
        sa.Column("deleted", sa.Boolean, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("friendship_id", "user_id", "client_id", name="uq_direct_message_client"),
        sa.Index("ix_direct_messages_conversation", "friendship_id", "id"),
    ).create(op.get_bind(), checkfirst=True)
    sa.Table("destination_photos", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("destination_id", sa.Integer, sa.ForeignKey("destinations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("client_id", sa.String(36), nullable=False),
        sa.Column("caption", sa.String(300), nullable=False),
        sa.Column("image", sa.LargeBinary, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("destination_id", "user_id", "client_id", name="uq_destination_photo_client"),
        sa.Index("ix_destination_photos_destination_id", "destination_id"),
    ).create(op.get_bind(), checkfirst=True)
    sa.Table("destination_contributions", metadata,
        sa.Column("destination_id", sa.Integer, sa.ForeignKey("destinations.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("client_id", sa.String(36), nullable=False),
        sa.Column("cover_photo_id", sa.Integer, sa.ForeignKey("destination_photos.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("user_id", "client_id", name="uq_destination_contribution_client"),
    ).create(op.get_bind(), checkfirst=True)


def downgrade():
    raise RuntimeError("Removing community tables would erase private messages and uploaded photos. Restore a reviewed backup instead.")