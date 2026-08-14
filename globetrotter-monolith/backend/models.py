"""
SQLAlchemy 2.x models — the normalized relational schema that replaces
data.json. Every table has foreign keys, appropriate unique
constraints, indexes on columns we actually query by, and timestamps.

Ownership rule enforced throughout the app (never trust a client-sent
user_id): every row that belongs to a user carries a user_id foreign
key, and every query in data_access.py filters by the AUTHENTICATED
user's id, never one read from the request body.
"""
import datetime

from sqlalchemy import (
    String, Integer, Float, Boolean, Text, ForeignKey, DateTime,
    UniqueConstraint, Index, JSON,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def utcnow():
    return datetime.datetime.now(datetime.timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str | None] = mapped_column(String(320), unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    preferences: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    itineraries: Mapped[list["Itinerary"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    favorites: Mapped[list["Favorite"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    feedback_entries: Mapped[list["Feedback"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_users_email", "email"),
        Index("ix_users_phone", "phone"),
    )


class Destination(Base):
    __tablename__ = "destinations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    neighborhood: Mapped[str] = mapped_column(String(100), nullable=False)
    address: Mapped[str] = mapped_column(String(300), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    rating: Mapped[float] = mapped_column(Float, nullable=False)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    price_level: Mapped[int | None] = mapped_column(Integer, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    description: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str] = mapped_column(String(500), default="")

    itineraries: Mapped[list["Itinerary"]] = relationship(back_populates="destination")
    favorites: Mapped[list["Favorite"]] = relationship(back_populates="destination")

    __table_args__ = (
        Index("ix_destinations_category", "category"),
        Index("ix_destinations_neighborhood", "neighborhood"),
    )


class Itinerary(Base):
    __tablename__ = "itineraries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    destination_id: Mapped[int] = mapped_column(ForeignKey("destinations.id"), nullable=False)
    start_date: Mapped[str] = mapped_column(String(10), nullable=False)  # ISO YYYY-MM-DD
    end_date: Mapped[str] = mapped_column(String(10), nullable=False)
    time_slot: Mapped[str] = mapped_column(String(50), default="")
    transport_mode: Mapped[str] = mapped_column(String(20), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    shared_with: Mapped[list] = mapped_column(JSON, default=list)
    visited: Mapped[bool] = mapped_column(Boolean, default=False)
    review_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    review_comment: Mapped[str] = mapped_column(Text, default="")
    review_visited_date: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="itineraries")
    destination: Mapped["Destination"] = relationship(back_populates="itineraries")

    __table_args__ = (
        Index("ix_itineraries_user_id", "user_id"),
        Index("ix_itineraries_destination_id", "destination_id"),
    )


class Favorite(Base):
    __tablename__ = "favorites"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    destination_id: Mapped[int] = mapped_column(ForeignKey("destinations.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="favorites")
    destination: Mapped["Destination"] = relationship(back_populates="favorites")

    __table_args__ = (
        # A user can only favorite a given place once — enforced at the
        # database level, not just in application code.
        UniqueConstraint("user_id", "destination_id", name="uq_favorite_user_destination"),
    )


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    user_name: Mapped[str] = mapped_column(String(200), nullable=False)  # snapshot at submission time
    message: Mapped[str] = mapped_column(Text, nullable=False)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="feedback_entries")


class AuditLog(Base):
    """Security-sensitive event trail — logins, failed logins, account
    changes. Never stores credentials, only what happened and when."""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. "login_success", "login_failed"
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (
        Index("ix_audit_logs_user_id", "user_id"),
        Index("ix_audit_logs_event_type", "event_type"),
    )
