"""Add private day trips with ordered stops and user-entered budgets."""
from alembic import op
import sqlalchemy as sa


revision = "20260926_day_trips"
down_revision = "20260919_social_places"
branch_labels = None
depends_on = None


def upgrade():
    metadata = sa.MetaData()
    sa.Table("users", metadata, sa.Column("id", sa.Integer, primary_key=True))
    sa.Table("destinations", metadata, sa.Column("id", sa.Integer, primary_key=True))
    sa.Table("day_trips", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.String(36), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("trip_date", sa.String(10), nullable=False),
        sa.Column("start_time", sa.String(5), nullable=False),
        sa.Column("budget_fcfa", sa.Integer),
        sa.Column("transport_cost_fcfa", sa.Integer),
        sa.Column("notes", sa.Text, nullable=False),
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("user_id", "client_id", name="uq_day_trip_client"),
        sa.Index("ix_day_trips_user_date", "user_id", "trip_date"),
        sa.CheckConstraint("budget_fcfa IS NULL OR budget_fcfa BETWEEN 0 AND 10000000", name="ck_day_trip_budget"),
        sa.CheckConstraint("transport_cost_fcfa IS NULL OR transport_cost_fcfa BETWEEN 0 AND 10000000", name="ck_day_trip_transport_cost"),
    ).create(op.get_bind(), checkfirst=True)
    sa.Table("day_trip_stops", metadata,
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("day_trip_id", sa.Integer, sa.ForeignKey("day_trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("destination_id", sa.Integer, sa.ForeignKey("destinations.id"), nullable=False),
        sa.Column("position", sa.Integer, nullable=False),
        sa.Column("visit_minutes", sa.Integer, nullable=False),
        sa.Column("cost_fcfa", sa.Integer),
        sa.UniqueConstraint("day_trip_id", "position", name="uq_day_trip_stop_position"),
        sa.UniqueConstraint("day_trip_id", "destination_id", name="uq_day_trip_stop_destination"),
        sa.CheckConstraint("position BETWEEN 0 AND 11", name="ck_day_trip_stop_position"),
        sa.CheckConstraint("visit_minutes BETWEEN 5 AND 720", name="ck_day_trip_stop_duration"),
        sa.CheckConstraint("cost_fcfa IS NULL OR cost_fcfa BETWEEN 0 AND 10000000", name="ck_day_trip_stop_cost"),
    ).create(op.get_bind(), checkfirst=True)


def downgrade():
    raise RuntimeError("Removing day trips would erase saved plans. Restore a reviewed backup instead.")