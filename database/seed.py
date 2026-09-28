from datetime import timedelta

from database import db
from database.models import Customer, MemoryRecord, Ticket, TicketMessage, User, utcnow


def seed_demo_data():
    if User.query.first():
        return

    alex = User(name="Alex Morgan", email="alex@resolvedesk.demo", role="Support Specialist")
    alex.set_password("resolvedesk")
    sarah = Customer(name="Sarah Mitchell", email="sarah@northstarlabs.com", company="Northstar Labs", status="Returning")
    daniel = Customer(name="Daniel Carter", email="daniel@meridian.io", company="Meridian Systems", status="Active")
    priya = Customer(name="Priya Shah", email="priya@fieldnotes.co", company="Fieldnotes", status="Active")
    db.session.add_all([alex, sarah, daniel, priya])
    db.session.flush()

    now = utcnow()
    tickets = [
        Ticket(reference="RD-1048", customer_id=sarah.id, subject="Payment integration failing", priority="High", status="Open", assignee="Alex Morgan", updated_at=now - timedelta(minutes=8)),
        Ticket(reference="RD-1047", customer_id=daniel.id, subject="API requests timing out", priority="Medium", status="In progress", assignee="Maya Chen", updated_at=now - timedelta(minutes=24)),
        Ticket(reference="RD-1046", customer_id=priya.id, subject="Invoice export formatting", priority="Low", status="Waiting on customer", assignee="Alex Morgan", updated_at=now - timedelta(hours=2)),
    ]
    db.session.add_all(tickets)
    db.session.flush()
    db.session.add_all([
        TicketMessage(ticket_id=tickets[0].id, sender="customer", body="The payment problem is happening again. We have a billing run tomorrow.", created_at=now - timedelta(minutes=8)),
        TicketMessage(ticket_id=tickets[1].id, sender="customer", body="We're still seeing timeouts on larger API requests.", created_at=now - timedelta(minutes=24)),
        TicketMessage(ticket_id=tickets[2].id, sender="agent", body="I sent a sample export. Could you confirm which columns should be included?", created_at=now - timedelta(hours=2)),
    ])
    db.session.add_all([
        MemoryRecord(customer_id=sarah.id, category="Previous issue", content="Payment integration failed during invoice processing on September 18.", source="Ticket RD-1012", created_at=now - timedelta(days=10)),
        MemoryRecord(customer_id=sarah.id, category="Attempted solution", content="Sarah reconnected the payment provider. This restored invoice processing temporarily.", source="Ticket RD-1012", created_at=now - timedelta(days=10)),
        MemoryRecord(customer_id=sarah.id, category="Outcome", content="The payment issue returned three days after reconnecting the provider.", source="Ticket RD-1012", created_at=now - timedelta(days=7)),
        MemoryRecord(customer_id=sarah.id, category="Customer preference", content="Sarah prefers detailed explanations and email updates.", source="Conversation note", created_at=now - timedelta(days=5)),
        MemoryRecord(customer_id=sarah.id, category="Important context", content="Northstar Labs is preparing for its monthly billing cycle.", source="Ticket RD-1048", created_at=now - timedelta(hours=1)),
        MemoryRecord(customer_id=daniel.id, category="Previous issue", content="Large API requests can exceed the current 30 second timeout.", source="Ticket RD-0993", created_at=now - timedelta(days=3)),
    ])
    db.session.commit()
