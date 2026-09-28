from services.hindsight_service import HindsightService
from services.llm_service import LLMService


class SupportAgent:
    @staticmethod
    def prepare_reply(customer, message):
        recall = HindsightService.recall(customer, message)
        memories = recall["results"]
        reply, generation_mode = LLMService.draft_reply(customer, message, memories)
        return {"reply": reply, "memories": memories, "memory_mode": recall["mode"], "generation_mode": generation_mode, "context_found": bool(memories)}

    @staticmethod
    def prepare_reply_with_memories(customer, message, memories):
        reply, generation_mode = LLMService.draft_reply(customer, message, memories)
        return {"reply": reply, "memories": memories, "memory_mode": "fallback", "generation_mode": generation_mode, "context_found": bool(memories)}

    @staticmethod
    def retain_interaction(customer, message, reply, category="Interaction"):
        return HindsightService.retain(customer, category, f"Customer said: {message}\nAgent response: {reply}")
