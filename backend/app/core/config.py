from pathlib import Path
from typing import Literal
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / '.env', extra='ignore')
    langsmith_tracing: bool = False
    langsmith_api_key: str = ''
    langsmith_project: str = 'iso-agent'
    langsmith_endpoint: str = 'https://api.smith.langchain.com'
    langsmith_workspace_id: str = ''
    groq_api_key: str = ''
    groq_model: str = 'openai/gpt-oss-120b'
    document_dir: Path = BACKEND_DIR / 'ISO 9001 Full Documents'
    data_dir: Path = BACKEND_DIR / 'data'
    soffice_path: str = ''
    libreoffice_path: str = ''
    conversion_timeout: int = Field(default=120, ge=1)
    embedding_model: str = 'BAAI/bge-m3'
    reranker_model: str = 'BAAI/bge-reranker-v2-m3'
    model_device: str = 'cpu'
    model_cache_dir: Path = BACKEND_DIR / '.cache' / 'huggingface' / 'hub'
    model_local_files_only: bool = False
    embedding_batch_size: int = Field(default=16, ge=1, le=512)
    reranker_batch_size: int = Field(default=8, ge=1, le=128)
    reranker_max_tokens: int = Field(default=1024, ge=32, le=8192)
    chunk_max_tokens: int = Field(default=500, ge=32, le=8192)
    vector_search_limit: int = Field(default=20, ge=1, le=200)
    final_result_limit: int = Field(default=5, ge=1, le=100)
    multi_query_limit: int = Field(default=3, ge=1, le=5)
    multi_query_candidate_limit: int = Field(default=40, ge=1, le=200)
    retrieval_max_retries: int = Field(default=1, ge=0, le=2)
    clarification_max_rounds: int = Field(default=2, ge=1, le=5)
    graph_structured_output_method: Literal['json_schema', 'json_mode', 'function_calling'] = 'json_schema'
    qdrant_url: str = 'http://localhost:6333'
    qdrant_collection: str = 'iso_documents_bge_m3'
    qdrant_api_key: str = ''
    qdrant_path: str = ''
    qdrant_timeout: int = Field(default=30, ge=1)
    qdrant_batch_size: int = Field(default=64, ge=1, le=512)
    upload_max_bytes: int = Field(default=50 * 1024 * 1024, ge=1)
    cors_origins: str = 'http://localhost:5173,http://127.0.0.1:5173'

    @model_validator(mode='after')
    def paths_and_limits(self):
        for name in ('document_dir', 'data_dir', 'model_cache_dir'):
            value = getattr(self, name)
            setattr(self, name, value.resolve() if value.is_absolute() else (BACKEND_DIR / value).resolve())
        if self.qdrant_path and self.qdrant_path != ':memory:':
            self.qdrant_path = str((BACKEND_DIR / self.qdrant_path).resolve())
        if self.final_result_limit > self.vector_search_limit:
            raise ValueError('FINAL_RESULT_LIMIT must not exceed VECTOR_SEARCH_LIMIT')
        return self

    @property
    def office_executable(self):
        return self.libreoffice_path or self.soffice_path

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(',') if origin.strip()]


settings = Settings()
