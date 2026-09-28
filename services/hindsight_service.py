from datetime import datetime

import requests
from flask import current_app

from database.models import MemoryRecord


class HindsightService:
    """Thin adapter for Hindsight's retain/recall API, with a deterministic local demo mode."""

    @staticmethod
    def _headers():
        headers = {"Content-Type": "application/json"}
        token = current_app.config.get("HINDSIGHT_API_KEY")
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    @staticmethod
    def _bank_url(suffix):
        base = current_app.config["HINDSIGHT_BASE_URL"]
        bank = current_app.config["HINDSIGHT_BANK_ID"]
        return f"{base}/v1/default/banks/{bank}/memories{suffix}"

    @classmethod
    def retain(cls, customer, category, content, source="Support interaction"):
        base = current_app.config["HINDSIGHT_BASE_URL"]
        if base:
            try:
                response = requests.post(
                    cls._bank_url(""),
                    headers=cls._headers(),
                    json={"items": [{"content": f"Customer: {customer.name} ({customer.company}). {category}: {content}", "tags": [f"customer:{customer.id}", "support"], "context": "ResolveDesk support interaction"}], "async": True},
                    timeout=8,
                )
                response.raise_for_status()
                return {"mode": "hindsight", "stored": True}
            except requests.RequestException:
                current_app.logger.warning("Hindsight retain unavailable; storing local fallback context", exc_info=True)
                return cls._retain_locally(customer, category, content, source, mode="fallback")

        return cls._retain_locally(customer, category, content, source)

    @staticmethod
    def _retain_locally(customer, category, content, source, mode="demo"):
        record = MemoryRecord(customer_id=customer.id, category=category, content=content, source=source)
        from database import db
        db.session.add(record)
        db.session.commit()
        return {"mode": mode, "stored": True, "record": record}

    @classmethod
    def recall(cls, customer, query):
        base = current_app.config["HINDSIGHT_BASE_URL"]
        if base:
            try:
                response = requests.post(
                    cls._bank_url("/recall"),
                    headers=cls._headers(),
                    json={"query": f"Customer {customer.name}: {query}", "budget": "mid", "max_tokens": 1024, "tags": [f"customer:{customer.id}"], "tags_match": "any_strict"},
                    timeout=10,
                )
                response.raise_for_status()
                payload = response.json()
                return {"mode": "hindsight", "results": cls._normalize_results(payload), "available": True}
            except (requests.RequestException, ValueError):
                current_app.logger.warning("Hindsight recall unavailable; using saved local context", exc_info=True)
                return cls._recall_locally(customer, query, mode="fallback", available=False)

        return cls._recall_locally(customer, query)

    @staticmethod
    def _recall_locally(customer, query, mode="demo", available=True):
        records = MemoryRecord.query.filter_by(customer_id=customer.id).order_by(MemoryRecord.created_at.desc()).all()
        terms = {term.lower().strip(".,!?;:") for term in query.split() if len(term) > 3}
        ranked = sorted(records, key=lambda record: sum(term in record.content.lower() for term in terms), reverse=True)
        return {"mode": mode, "results": [HindsightService._serialize(record) for record in ranked[:4]], "available": available}

    @staticmethod
    def _normalize_results(payload):
        results = payload.get("results", []) if isinstance(payload, dict) else []
        normalized = []
        for item in results:
            if isinstance(item, str):
                normalized.append({"content": item, "category": "Customer context", "source": "Hindsight", "confidence": 92})
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content") or item.get("fact") or item.get("snippet")
                if text:
                    confidence = item.get("confidence", 0.92)
                    try:
                        confidence = float(confidence)
                        confidence = round(confidence * 100) if confidence <= 1 else int(confidence)
                    except (TypeError, ValueError):
                        confidence = 92
                    normalized.append({"content": text, "category": item.get("type", "Customer context"), "source": "Hindsight", "confidence": confidence})
        return normalized

    @staticmethod
    def _serialize(record):
        return {"content": record.content, "category": record.category, "source": record.source, "confidence": record.confidence, "created_at": record.created_at.isoformat() if isinstance(record.created_at, datetime) else None}
