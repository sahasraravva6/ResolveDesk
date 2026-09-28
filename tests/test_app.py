import pytest
import requests

from app import create_app
from database import db


@pytest.fixture()
def client(tmp_path):
    database_file = tmp_path / "test.db"
    app = create_app({"TESTING": True, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{database_file}", "SECRET_KEY": "test", "HINDSIGHT_BASE_URL": "", "LLM_API_KEY": ""})
    with app.test_client() as test_client:
        yield test_client
    with app.app_context():
        db.drop_all()


def test_demo_dashboard_and_customer_context(client):
    dashboard = client.get("/api/dashboard")
    assert dashboard.status_code == 200
    assert dashboard.json["stats"]["open"] >= 1

    customers = client.get("/api/customers?q=Sarah")
    assert customers.status_code == 200
    sarah = customers.json["customers"][0]

    recall = client.post("/api/memories/recall", json={"customer_id": sarah["id"], "query": "payment problem happening again"})
    assert recall.status_code == 200
    assert any("provider" in item["content"].lower() for item in recall.json["results"])


def test_agent_draft_uses_retained_customer_history(client):
    tickets = client.get("/api/tickets").json["tickets"]
    sarah_ticket = next(ticket for ticket in tickets if ticket["customer"] == "Sarah Mitchell")
    draft = client.post(f"/api/tickets/{sarah_ticket['id']}/draft", json={"message": "The payment problem is happening again"})
    assert draft.status_code == 200
    assert draft.json["context_found"] is True
    assert "reconnecting" in draft.json["reply"].lower() or "reconnected" in draft.json["reply"].lower()


def test_send_reply_persists_message_and_retains_context(client):
    tickets = client.get("/api/tickets").json["tickets"]
    ticket = tickets[0]
    response = client.post(f"/api/tickets/{ticket['id']}/messages", json={"sender": "agent", "body": "I am checking the provider connection now."})
    assert response.status_code == 200
    assert response.json["retained"] is True
    detail = client.get("/api/customers/1").json
    assert len(detail["memories"]) >= 1


def test_provider_outage_falls_back_to_saved_context(client, monkeypatch):
    client.application.config.update({"HINDSIGHT_BASE_URL": "http://hindsight.invalid", "LLM_API_KEY": "test-key"})

    def unavailable(*args, **kwargs):
        raise requests.ConnectionError("provider is offline")

    monkeypatch.setattr("services.hindsight_service.requests.post", unavailable)
    monkeypatch.setattr("services.llm_service.requests.post", unavailable)
    tickets = client.get("/api/tickets").json["tickets"]
    sarah_ticket = next(ticket for ticket in tickets if ticket["customer"] == "Sarah Mitchell")

    draft = client.post(f"/api/tickets/{sarah_ticket['id']}/draft", json={"message": "The payment problem is happening again"})
    assert draft.status_code == 200
    assert draft.json["context_found"] is True
    assert draft.json["memory_mode"] == "fallback"
    assert "previous payment" in draft.json["reply"].lower()


def test_staff_signup_creates_authenticated_account(client):
    response = client.post("/api/auth/signup", json={"name": "Jamie Lee", "email": "jamie@example.com", "password": "a-secure-password"})
    assert response.status_code == 201
    assert response.json["user"]["name"] == "Jamie Lee"

    duplicate = client.post("/api/auth/signup", json={"name": "Jamie Lee", "email": "jamie@example.com", "password": "a-secure-password"})
    assert duplicate.status_code == 409
