import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "local-demo-secret-change-me")
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL") or f"sqlite:///{BASE_DIR / 'instance' / 'resolvedesk.db'}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True} if SQLALCHEMY_DATABASE_URI.startswith("mysql") else {}
    HINDSIGHT_BASE_URL = os.getenv("HINDSIGHT_BASE_URL", "").rstrip("/")
    HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")
    HINDSIGHT_BANK_ID = os.getenv("HINDSIGHT_BANK_ID", "resolvedesk-demo")
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
    LLM_API_KEY = os.getenv("LLM_API_KEY", "")
    LLM_MODEL = os.getenv("LLM_MODEL", "llama-3.3-70b-versatile")
