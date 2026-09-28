import requests
from flask import current_app


class LLMService:
    @classmethod
    def draft_reply(cls, customer, message, memories):
        api_key = current_app.config.get("LLM_API_KEY")
        if api_key:
            context = "\n".join(f"- {item['content']}" for item in memories) or "No prior context was found."
            try:
                response = requests.post(
                    f"{current_app.config['LLM_BASE_URL']}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json={
                        "model": current_app.config["LLM_MODEL"],
                        "temperature": 0.4,
                        "messages": [
                            {"role": "system", "content": "You are a thoughtful customer-support specialist. Draft a concise, warm, accurate reply. Never claim an action was completed unless the context says so. The human agent will review before sending."},
                            {"role": "user", "content": f"Customer: {customer.name} at {customer.company}\nCurrent message: {message}\nRelevant remembered context:\n{context}\nDraft the reply."},
                        ],
                    },
                    timeout=20,
                )
                response.raise_for_status()
                return response.json()["choices"][0]["message"]["content"].strip(), "llm"
            except (requests.RequestException, KeyError, IndexError, TypeError, ValueError):
                current_app.logger.warning("LLM provider unavailable; using demo response generator", exc_info=True)

        history = " ".join(item["content"] for item in memories).lower()
        if memories and any(word in history for word in ("payment", "provider", "integration")):
            return (f"Hi {customer.name.split()[0]}, thanks for letting us know this has returned. I found your previous payment-integration issue. Last time, reconnecting the provider helped temporarily, but the problem came back. Let's pick up from there: could you share the latest failed invoice ID? I'll check the connection before we repeat any steps.", "demo")
        if memories:
            return (f"Hi {customer.name.split()[0]}, thanks for reaching out again. I've reviewed the context from our earlier conversations so we can continue without starting over. I'll look into this and follow up with a clear next step shortly.", "demo")
        return (f"Hi {customer.name.split()[0]}, thanks for reaching out. I can help investigate this. Could you share when the issue started and any error message you are seeing? I'll take it from there.", "demo")
