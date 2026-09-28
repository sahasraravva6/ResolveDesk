# ResolveDesk

**Support that remembers.** ResolveDesk is a Flask customer-support workspace that helps an agent continue from what happened before, instead of asking a returning customer to start over.

## What works

- Ticket dashboard, queue, status changes, reply composition, and customer search
- Customer creation and customer profiles with ticket history and context timeline
- Hindsight recall before drafting and retain after an agent sends a reply
- Reviewed LLM reply drafts, with a deterministic demo response when no LLM key is configured
- Memory timeline, support insights, team and integration settings
- Demo sign-in: `alex@resolvedesk.demo` / `resolvedesk`

## Architecture

The Flask API owns tickets, customers, and conversations. SQLAlchemy stores those business records in MySQL when `DATABASE_URL` points to MySQL, or local SQLite when it is blank. Hindsight is a separate memory service. When `HINDSIGHT_BASE_URL` is set, the adapter calls Hindsight's bank memory retain and recall endpoints; otherwise the application runs its seeded in-process demo-memory mode. Database memory rows in demo mode are a development fallback and are not a replacement for a configured Hindsight bank.

Hindsight routes follow its API reference: `POST /v1/default/banks/{bank_id}/memories` to retain and `POST /v1/default/banks/{bank_id}/memories/recall` to recall. Retains are tagged by customer ID and support; recall filters to that customer's tag. API credentials are optional for a local Hindsight server and sent as a Bearer token when configured.

An agent reply draft recalls customer context first, passes the relevant results and current message to the LLM service, then returns a draft for agent review. Sending the reply persists the message and retains the interaction. The app never sends generated text automatically.

## Run locally

1. Create a virtual environment and install requirements:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. Copy `.env.example` to `.env`. Leave `DATABASE_URL`, `HINDSIGHT_BASE_URL`, and API keys blank to use the local SQLite and demo-memory/LLM fallbacks. Add MySQL and provider values when those services are available.

3. Start the server:

   ```powershell
   py app.py
   ```

4. Open `http://127.0.0.1:5000` and use the demo sign-in credentials above.

The first launch creates tables and seeds Sarah Mitchell's prior payment-provider attempt, temporary outcome, preference, and upcoming billing context. Her open ticket is ready to demonstrate recall and a personalized draft.

## Environment variables

| Name | Purpose |
|---|---|
| `DATABASE_URL` | MySQL SQLAlchemy URL; blank uses SQLite under `instance/` |
| `SECRET_KEY` | Flask session signing secret |
| `HINDSIGHT_BASE_URL` | Hindsight service root URL, without a trailing slash |
| `HINDSIGHT_API_KEY` | Optional Bearer token for the Hindsight API |
| `HINDSIGHT_BANK_ID` | Memory bank ID, default `resolvedesk-demo` |
| `LLM_BASE_URL` | OpenAI-compatible chat completions root |
| `LLM_API_KEY` | Optional LLM provider key |
| `LLM_MODEL` | Provider model name |

## Test

```powershell
py -m pytest -q
```

## Project structure

- `app.py` — Flask routes and JSON API
- `config.py` — environment configuration
- `database/models.py` — SQLAlchemy business and demo memory records
- `database/seed.py` — deterministic demo customer/ticket data
- `services/hindsight_service.py` — Hindsight REST adapter and local demo mode
- `services/llm_service.py` — OpenAI-compatible draft generator and fallback
- `services/support_agent.py` — recall, draft, and retain flow
- `templates/` and `static/` — responsive HTML, CSS, and vanilla JavaScript
- `tests/` — API and memory-flow tests
