from pydantic import BaseModel, Field


class Chunk(BaseModel):
    text: str
    metadata: dict = Field(default_factory=dict)


class SearchHit(BaseModel):
    text: str
    score: float
    vector_score: float
    metadata: dict = Field(default_factory=dict)
    citation: int = 0


class SearchResponse(BaseModel):
    query: str
    results: list[SearchHit]
    score_type: str = 'reranker_logit'


class IngestResponse(BaseModel):
    document_id: str
    document_name: str
    status: str
    chunks: int


class DocumentResponse(BaseModel):
    document_id: str
    chunks: int
    metadata: dict
