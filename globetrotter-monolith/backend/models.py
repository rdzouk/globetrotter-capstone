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
    UniqueConstraint, Index, JSON, CheckConstraint, LargeBinary,
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
    comments: Mapped[list["Comment"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    feedback_entries: Mapped[list["Feedback"]] = relationship(back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_users_email", "email"),
        Index("ix_users_phone", "phone"),
    )


class AccountSecurity(Base):
    __tablename__ = "account_security"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    session_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="user", nullable=False)


class PasswordReset(Base):
    __tablename__ = "password_resets"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    password_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)


class FarePolicy(Base):
    __tablename__ = "fare_policies"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)


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
    publication: Mapped["DestinationPublication | None"] = relationship(back_populates="destination", uselist=False, lazy="joined", cascade="all, delete-orphan")
    contribution: Mapped["DestinationContribution | None"] = relationship(back_populates="destination", uselist=False, lazy="joined", cascade="all, delete-orphan")

    itineraries: Mapped[list["Itinerary"]] = relationship(back_populates="destination")
    favorites: Mapped[list["Favorite"]] = relationship(back_populates="destination")
    comments: Mapped[list["Comment"]] = relationship(back_populates="destination", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_destinations_category", "category"),
        Index("ix_destinations_neighborhood", "neighborhood"),
    )


class DestinationPublication(Base):
    __tablename__ = "destination_publications"

    destination_id: Mapped[int] = mapped_column(ForeignKey("destinations.id", ondelete="CASCADE"), primary_key=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    description_fr: Mapped[str] = mapped_column(Text, default="", nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    destination: Mapped["Destination"] = relationship(back_populates="publication")


class DestinationPhoto(Base):
    __tablename__ = "destination_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    destination_id: Mapped[int] = mapped_column(ForeignKey("destinations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    client_id: Mapped[str] = mapped_column(String(36), nullable=False)
    caption: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    image: Mapped[bytes] = mapped_column(LargeBinary, nullable=False, deferred=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    user: Mapped["User | None"] = relationship(lazy="joined")

    __table_args__ = (UniqueConstraint("destination_id", "user_id", "client_id", name="uq_destination_photo_client"),)


class DestinationContribution(Base):
    __tablename__ = "destination_contributions"

    destination_id: Mapped[int] = mapped_column(ForeignKey("destinations.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    client_id: Mapped[str] = mapped_column(String(36), nullable=False)
    cover_photo_id: Mapped[int | None] = mapped_column(ForeignKey("destination_photos.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    user: Mapped["User | None"] = relationship(lazy="joined")
    destination: Mapped["Destination"] = relationship(back_populates="contribution")

    __table_args__ = (UniqueConstraint("user_id", "client_id", name="uq_destination_contribution_client"),)


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    place_id: Mapped[int] = mapped_column(ForeignKey("destinations.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    parent_comment_id: Mapped[int | None] = mapped_column(ForeignKey("comments.id", ondelete="CASCADE"), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="comments")
    destination: Mapped["Destination"] = relationship(back_populates="comments")
    parent: Mapped["Comment | None"] = relationship(back_populates="replies", remote_side="Comment.id")
    replies: Mapped[list["Comment"]] = relationship(back_populates="parent", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_comments_place_id", "place_id"),
        Index("ix_comments_parent_comment_id", "parent_comment_id"),
        Index("ix_comments_created_at", "created_at"),
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


class GoogleIdentity(Base):
    __tablename__ = "google_identities"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    subject: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship()


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    reply_to_id: Mapped[int | None] = mapped_column(ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)
    client_id: Mapped[str] = mapped_column(String(36), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship()
    reply_to: Mapped["ChatMessage | None"] = relationship(remote_side="ChatMessage.id")

    __table_args__ = (UniqueConstraint("user_id", "client_id", name="uq_chat_user_client"),)


class Friendship(Base):
    __tablename__ = "friendships"

    id: Mapped[int] = mapped_column(primary_key=True)
    lower_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    higher_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_by: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    accepted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    lower_user: Mapped["User"] = relationship(foreign_keys=[lower_user_id], lazy="joined")
    higher_user: Mapped["User"] = relationship(foreign_keys=[higher_user_id], lazy="joined")
    messages: Mapped[list["DirectMessage"]] = relationship(cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("lower_user_id", "higher_user_id", name="uq_friendship_pair"),
        CheckConstraint("lower_user_id < higher_user_id", name="ck_friendship_order"),
        CheckConstraint("requested_by IN (lower_user_id, higher_user_id)", name="ck_friendship_requester"),
    )


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    friendship_id: Mapped[int] = mapped_column(ForeignKey("friendships.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    client_id: Mapped[str] = mapped_column(String(36), nullable=False)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    audio: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True, deferred=True)
    audio_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    user: Mapped["User"] = relationship(lazy="joined")

    __table_args__ = (
        UniqueConstraint("friendship_id", "user_id", "client_id", name="uq_direct_message_client"),
        Index("ix_direct_messages_conversation", "friendship_id", "id"),
    )
