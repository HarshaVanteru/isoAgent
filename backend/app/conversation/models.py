"""Required, closed schemas for provider-native structured decisions."""
from typing import Literal
from pydantic import BaseModel, ConfigDict


class Decision(BaseModel):
    model_config = ConfigDict(extra='forbid')


class ConversationRoute(Decision):
    route: Literal['conversation', 'document']


class QueryAnalysis(Decision):
    clear: bool
    standalone_query: str
    clarification_question: str


class QueryVariants(Decision):
    queries: list[str]


class RetrievalQuality(Decision):
    sufficient: bool
    supporting_citations: list[int]
    reason: str
