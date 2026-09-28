from datetime import datetime, timezone

from werkzeug.security import check_password_hash, generate_password_hash

from database import db


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(80), default="Support Specialist", nullable=False)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class Customer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(140), nullable=False, index=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    company = db.Column(db.String(160), default="Independent", nullable=False)
    status = db.Column(db.String(40), default="Active", nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    tickets = db.relationship("Ticket", backref="customer", cascade="all, delete-orphan", order_by="Ticket.updated_at.desc()")
    memories = db.relationship("MemoryRecord", backref="customer", cascade="all, delete-orphan", order_by="MemoryRecord.created_at.desc()")


class Ticket(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    reference = db.Column(db.String(32), unique=True, nullable=False, index=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.id"), nullable=False, index=True)
    subject = db.Column(db.String(240), nullable=False)
    priority = db.Column(db.String(24), default="Medium", nullable=False)
    status = db.Column(db.String(32), default="Open", nullable=False, index=True)
    assignee = db.Column(db.String(120), default="Alex Morgan", nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow, nullable=False)
    messages = db.relationship("TicketMessage", backref="ticket", cascade="all, delete-orphan", order_by="TicketMessage.created_at.asc()")


class TicketMessage(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    ticket_id = db.Column(db.Integer, db.ForeignKey("ticket.id"), nullable=False, index=True)
    sender = db.Column(db.String(24), nullable=False)
    body = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)


class MemoryRecord(db.Model):
    """Local memory used only when Hindsight is not configured and for activity display."""

    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.id"), nullable=False, index=True)
    category = db.Column(db.String(60), nullable=False)
    content = db.Column(db.Text, nullable=False)
    source = db.Column(db.String(120), default="Support interaction", nullable=False)
    confidence = db.Column(db.Integer, default=92, nullable=False)
    created_at = db.Column(db.DateTime, default=utcnow, nullable=False)
