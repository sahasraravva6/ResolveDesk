from datetime import timedelta
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError

from config import Config
from database import db
from database.models import Customer, MemoryRecord, Ticket, TicketMessage, User, utcnow
from database.seed import seed_demo_data
from services.hindsight_service import HindsightService
from services.support_agent import SupportAgent


def create_app(test_config=None):
    app = Flask(__name__, instance_path=str(Path(__file__).resolve().parent / "instance"), instance_relative_config=True)
    app.config.from_object(Config)
    if test_config:
        app.config.update(test_config)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    db.init_app(app)

    with app.app_context():
        db.create_all()
        seed_demo_data()

    @app.get("/")
    def home():
        return render_template("index.html")

    @app.get("/api/bootstrap")
    def bootstrap():
        user = User.query.first()
        return jsonify({"user": {"name": session.get("user_name", user.name if user else "Alex Morgan"), "role": user.role if user else "Support Specialist"}, "memory_mode": "Hindsight connected" if app.config["HINDSIGHT_BASE_URL"] else "Demo memory", "llm_mode": "API connected" if app.config["LLM_API_KEY"] else "Demo responses"})

    @app.post("/api/auth/login")
    def login():
        data = request.get_json(silent=True) or {}
        user = User.query.filter(func.lower(User.email) == (data.get("email") or "").lower()).first()
        if not user or not user.check_password(data.get("password") or ""):
            return jsonify(error="Email or password is incorrect."), 401
        session["user_id"] = user.id
        session["user_name"] = user.name
        return jsonify(user={"name": user.name, "role": user.role})

    @app.post("/api/auth/signup")
    def signup():
        data = request.get_json(silent=True) or {}
        name = (data.get("name") or "").strip()
        email = (data.get("email") or "").strip().lower()
        password = data.get("password") or ""
        if not name or not email or len(password) < 8:
            return jsonify(error="Enter your name and work email, and use a password with at least 8 characters."), 400
        if User.query.filter_by(email=email).first():
            return jsonify(error="An account with that email already exists."), 409
        user = User(name=name, email=email, role="Support Specialist")
        user.set_password(password)
        db.session.add(user)
        try:
            db.session.commit()
        except SQLAlchemyError:
            db.session.rollback()
            return jsonify(error="We couldn't create your account. Please try again."), 503
        session["user_id"] = user.id
        session["user_name"] = user.name
        return jsonify(user={"name": user.name, "role": user.role}), 201

    @app.post("/api/auth/logout")
    def logout():
        session.clear()
        return jsonify(ok=True)

    @app.get("/api/dashboard")
    def dashboard():
        tickets = Ticket.query.order_by(Ticket.updated_at.desc()).limit(8).all()
        today = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        open_count = Ticket.query.filter(Ticket.status.in_(["Open", "In progress"])).count()
        waiting = Ticket.query.filter_by(status="Waiting on customer").count()
        resolved_today = Ticket.query.filter(Ticket.status == "Resolved", Ticket.updated_at >= today).count()
        returning = Customer.query.filter_by(status="Returning").count()
        total_customers = max(Customer.query.count(), 1)
        recent_memories = MemoryRecord.query.order_by(MemoryRecord.created_at.desc()).limit(4).all()
        return jsonify(stats={"open": open_count, "waiting": waiting, "resolved_today": resolved_today, "returning_rate": round(returning * 100 / total_customers)}, tickets=[ticket_json(ticket) for ticket in tickets], memories=[memory_json(memory) for memory in recent_memories])

    @app.get("/api/customers")
    def customers():
        query = (request.args.get("q") or "").strip()
        status = request.args.get("status", "All")
        statement = Customer.query
        if query:
            pattern = f"%{query}%"
            statement = statement.filter(db.or_(Customer.name.ilike(pattern), Customer.company.ilike(pattern), Customer.email.ilike(pattern)))
        if status != "All":
            statement = statement.filter_by(status=status)
        return jsonify(customers=[customer_json(customer) for customer in statement.order_by(Customer.name).all()])

    @app.post("/api/customers")
    def create_customer():
        data = request.get_json(silent=True) or {}
        if not data.get("name") or not data.get("email"):
            return jsonify(error="Name and email are required."), 400
        customer = Customer(name=data["name"].strip(), email=data["email"].strip().lower(), company=(data.get("company") or "Independent").strip())
        db.session.add(customer)
        try:
            db.session.commit()
        except SQLAlchemyError:
            db.session.rollback()
            return jsonify(error="A customer with that email already exists."), 409
        return jsonify(customer=customer_json(customer)), 201

    @app.get("/api/customers/<int:customer_id>")
    def customer_detail(customer_id):
        customer = db.get_or_404(Customer, customer_id)
        return jsonify(customer=customer_json(customer, detail=True), tickets=[ticket_json(ticket) for ticket in customer.tickets], memories=[memory_json(memory) for memory in customer.memories])

    @app.get("/api/tickets")
    def tickets_list():
        query = (request.args.get("q") or "").strip()
        status = request.args.get("status", "All")
        statement = Ticket.query.join(Customer)
        if query:
            pattern = f"%{query}%"
            statement = statement.filter(db.or_(Ticket.subject.ilike(pattern), Ticket.reference.ilike(pattern), Customer.name.ilike(pattern)))
        if status != "All":
            statement = statement.filter(Ticket.status == status)
        tickets = statement.order_by(Ticket.updated_at.desc()).all()
        return jsonify(tickets=[ticket_json(ticket, include_messages=True) for ticket in tickets])

    @app.post("/api/tickets")
    def create_ticket():
        data = request.get_json(silent=True) or {}
        customer = db.session.get(Customer, data.get("customer_id"))
        if not customer or not (data.get("subject") or "").strip():
            return jsonify(error="Choose a customer and enter a ticket subject."), 400
        ticket = Ticket(reference=f"RD-{1000 + (Ticket.query.count() + 1)}", customer_id=customer.id, subject=data["subject"].strip(), priority=data.get("priority", "Medium"), status="Open")
        db.session.add(ticket)
        db.session.flush()
        if (data.get("message") or "").strip():
            db.session.add(TicketMessage(ticket_id=ticket.id, sender="customer", body=data["message"].strip()))
        db.session.commit()
        return jsonify(ticket=ticket_json(ticket, include_messages=True)), 201

    @app.patch("/api/tickets/<int:ticket_id>")
    def update_ticket(ticket_id):
        ticket = db.get_or_404(Ticket, ticket_id)
        data = request.get_json(silent=True) or {}
        if data.get("status") in {"Open", "In progress", "Waiting on customer", "Resolved"}:
            ticket.status = data["status"]
        if data.get("priority") in {"Low", "Medium", "High", "Urgent"}:
            ticket.priority = data["priority"]
        ticket.updated_at = utcnow()
        db.session.commit()
        return jsonify(ticket=ticket_json(ticket, include_messages=True))

    @app.post("/api/tickets/<int:ticket_id>/draft")
    def draft_reply(ticket_id):
        ticket = db.get_or_404(Ticket, ticket_id)
        data = request.get_json(silent=True) or {}
        message = (data.get("message") or (ticket.messages[-1].body if ticket.messages else "")).strip()
        if not message:
            return jsonify(error="Add a customer message before requesting a draft."), 400
        try:
            result = SupportAgent.prepare_reply(ticket.customer, message)
            return jsonify(**result)
        except Exception:
            app.logger.exception("Support context retrieval failed")
            memories = [memory_json(record) for record in ticket.customer.memories[:4]]
            result = SupportAgent.prepare_reply_with_memories(ticket.customer, message, memories) if hasattr(SupportAgent, "prepare_reply_with_memories") else None
            if result:
                return jsonify(**result, memory_warning="Hindsight is temporarily unavailable; showing saved demo context.")
            return jsonify(error="Customer context is temporarily unavailable. You can still write and send a reply."), 503

    @app.post("/api/tickets/<int:ticket_id>/messages")
    def send_message(ticket_id):
        ticket = db.get_or_404(Ticket, ticket_id)
        data = request.get_json(silent=True) or {}
        body = (data.get("body") or "").strip()
        sender = data.get("sender", "agent")
        if not body or sender not in {"agent", "customer"}:
            return jsonify(error="A valid message is required."), 400
        message = TicketMessage(ticket_id=ticket.id, sender=sender, body=body)
        ticket.updated_at = utcnow()
        if sender == "agent" and ticket.status == "Open":
            ticket.status = "In progress"
        db.session.add(message)
        db.session.commit()
        retained = None
        if sender == "agent":
            previous = next((item.body for item in reversed(ticket.messages[:-1]) if item.sender == "customer"), "")
            try:
                retained = SupportAgent.retain_interaction(ticket.customer, previous or ticket.subject, body, "Resolution" if data.get("resolved") else "Support interaction")
            except Exception:
                app.logger.exception("Hindsight retain failed")
        return jsonify(message=message_json(message), ticket=ticket_json(ticket, include_messages=True), retained=bool(retained), memory_mode=(retained or {}).get("mode", "unavailable"))

    @app.get("/api/memories")
    def memories_list():
        query = MemoryRecord.query.join(Customer)
        customer_id = request.args.get("customer_id", type=int)
        category = request.args.get("category")
        if customer_id:
            query = query.filter(MemoryRecord.customer_id == customer_id)
        if category and category != "All":
            query = query.filter(MemoryRecord.category == category)
        return jsonify(memories=[memory_json(memory) for memory in query.order_by(MemoryRecord.created_at.desc()).all()])

    @app.post("/api/memories/recall")
    def recall_context():
        data = request.get_json(silent=True) or {}
        customer = db.session.get(Customer, data.get("customer_id"))
        if not customer:
            return jsonify(error="Customer not found."), 404
        result = HindsightService.recall(customer, data.get("query", "support history"))
        return jsonify(result)

    @app.get("/api/insights")
    def insights():
        total = max(Ticket.query.count(), 1)
        resolved = Ticket.query.filter_by(status="Resolved").count()
        repeat = Customer.query.filter(Customer.tickets.any()).count()
        categories = db.session.query(Ticket.subject, func.count(Ticket.id)).group_by(Ticket.subject).order_by(func.count(Ticket.id).desc()).limit(5).all()
        return jsonify(metrics={"resolution_rate": round(resolved * 100 / total), "avg_response": "18m", "returning": Customer.query.filter_by(status="Returning").count(), "repeat_issues": sum(1 for _, count in categories if count > 1)}, categories=[{"name": name, "count": count} for name, count in categories], insight="Several returning customers report payment integration issues after reconnecting their provider.")

    @app.get("/api/settings")
    def settings():
        return jsonify(memory_mode="hindsight" if app.config["HINDSIGHT_BASE_URL"] else "demo", llm_mode="connected" if app.config["LLM_API_KEY"] else "demo", database_mode="mysql" if app.config["SQLALCHEMY_DATABASE_URI"].startswith("mysql") else "sqlite", bank_id=app.config["HINDSIGHT_BANK_ID"])

    @app.errorhandler(404)
    def not_found(error):
        if request.path.startswith("/api/"):
            return jsonify(error="The requested record was not found."), 404
        return error

    @app.errorhandler(SQLAlchemyError)
    def database_error(error):
        db.session.rollback()
        app.logger.exception("Database request failed")
        return jsonify(error="We couldn't complete that request. Please try again."), 503

    return app


def customer_json(customer, detail=False):
    result = {"id": customer.id, "name": customer.name, "email": customer.email, "company": customer.company, "status": customer.status, "customer_since": customer.created_at.strftime("%b %Y"), "ticket_count": len(customer.tickets), "open_tickets": sum(ticket.status != "Resolved" for ticket in customer.tickets), "last_contact": customer.tickets[0].updated_at.isoformat() if customer.tickets else None}
    if detail:
        result["memories"] = [memory_json(memory) for memory in customer.memories]
    return result


def ticket_json(ticket, include_messages=False):
    result = {"id": ticket.id, "reference": ticket.reference, "customer_id": ticket.customer_id, "customer": ticket.customer.name, "company": ticket.customer.company, "email": ticket.customer.email, "subject": ticket.subject, "priority": ticket.priority, "status": ticket.status, "assignee": ticket.assignee, "updated_at": ticket.updated_at.isoformat(), "created_at": ticket.created_at.isoformat()}
    if include_messages:
        result["messages"] = [message_json(message) for message in ticket.messages]
    return result


def message_json(message):
    return {"id": message.id, "sender": message.sender, "body": message.body, "created_at": message.created_at.isoformat()}


def memory_json(memory):
    return {"id": memory.id, "customer_id": memory.customer_id, "customer": memory.customer.name, "category": memory.category, "content": memory.content, "source": memory.source, "confidence": memory.confidence, "created_at": memory.created_at.isoformat()}


app = create_app()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
