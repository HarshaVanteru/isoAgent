from typing import Annotated, TypedDict
from langchain_core.messages import AnyMessage
from langgraph.graph.message import add_messages


class ChatState(TypedDict, total=False):
    messages: Annotated[list[AnyMessage], add_messages]
    request_started_at: float
    question: str
    category: str
    route: str
    query: str
    query_clear: bool
    expanded_queries: list[str]
    queries: list[str]
    attempted_queries: list[str]
    candidates: list[dict]
    sources: list[dict]
    clarification_question: str
    clarification_reply: str
    clarification_history: list[dict]
    clarification_count: int
    retry_count: int
    retrieval_attempts: int
    evidence_sufficient: bool
    quality_reason: str
    supporting_citations: list[int]
    draft: str
    answer: str
    decision: str
    review_action: str
    review_answer: str
    steps: list[str]
