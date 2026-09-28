"""Add notifications, shared trips, expenses, local events and safety tools."""
from alembic import op
import sqlalchemy as sa


revision = "20260928_community_tools"
down_revision = "20260926_day_trips"
branch_labels = None
depends_on = None


def upgrade():
    metadata = sa.MetaData()
    for name in ("users", "destinations", "day_trips"):
        sa.Table(name, metadata, sa.Column("id", sa.Integer, primary_key=True))
    sa.Table("notification_reads", metadata,
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("notification_id", sa.String(100), primary_key=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=False),
    )
    sa.Table("trip_members", metadata,
        sa.Column("day_trip_id", sa.Integer, sa.ForeignKey("day_trips.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True),
        sa.Column("accepted", sa.Boolean, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    sa.Table("trip_suggestions", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("day_trip_id", sa.Integer, sa.ForeignKey("day_trips.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("destination_id", sa.Integer, sa.ForeignKey("destinations.id"), nullable=False),
        sa.UniqueConstraint("day_trip_id", "destination_id", name="uq_trip_suggestion_place"),
    )
    sa.Table("trip_votes", metadata,
        sa.Column("suggestion_id", sa.Integer, sa.ForeignKey("trip_suggestions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )
    sa.Table("trip_expenses", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("day_trip_id", sa.Integer, sa.ForeignKey("day_trips.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("client_id", sa.String(36), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("category", sa.String(20), nullable=False),
        sa.Column("amount_fcfa", sa.Integer, nullable=False),
        sa.Column("participants", sa.JSON, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("day_trip_id", "user_id", "client_id", name="uq_trip_expense_client"),
        sa.CheckConstraint("amount_fcfa BETWEEN 1 AND 10000000", name="ck_trip_expense_amount"),
        sa.CheckConstraint("category IN ('transport', 'food', 'entry', 'stay', 'other')", name="ck_trip_expense_category"),
    )
    sa.Table("local_events", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("destination_id", sa.Integer, sa.ForeignKey("destinations.id"), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("title_fr", sa.String(160), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("description_fr", sa.Text, nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("price_fcfa", sa.Integer),
        sa.Column("source_url", sa.String(500), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.CheckConstraint("price_fcfa IS NULL OR price_fcfa BETWEEN 0 AND 10000000", name="ck_event_price"),
        sa.CheckConstraint("status IN ('draft', 'published', 'cancelled')", name="ck_event_status"),
        sa.CheckConstraint("ends_at > starts_at", name="ck_event_dates"),
    )
    sa.Table("event_interests", metadata,
        sa.Column("event_id", sa.Integer, sa.ForeignKey("local_events.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True),
    )
    sa.Table("user_blocks", metadata,
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("blocked_user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("user_id != blocked_user_id", name="ck_block_other_user"),
    )
    sa.Table("content_reports", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("reporter_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column("target_id", sa.Integer, nullable=False),
        sa.Column("reason", sa.String(30), nullable=False),
        sa.Column("details", sa.String(1000), nullable=False),
        sa.Column("snapshot", sa.JSON, nullable=False),
        sa.Column("evidence", sa.LargeBinary),
        sa.Column("evidence_type", sa.String(80)),
        sa.Column("status", sa.String(20), nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.Column("resolved_by", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.UniqueConstraint("reporter_id", "target_type", "target_id", name="uq_content_report_author_target"),
        sa.CheckConstraint("status IN ('open', 'dismissed', 'removed')", name="ck_report_status"),
    )
    for table in metadata.sorted_tables:
        if table.name not in ("users", "destinations", "day_trips"):
            table.create(op.get_bind(), checkfirst=True)


def downgrade():
    raise RuntimeError("Removing safety state and shared plans is unsafe. Restore a reviewed backup instead.")