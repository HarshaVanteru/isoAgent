"""Health and library-overview endpoints used by the frontend."""
from fastapi import APIRouter

from ...core.config import settings
from ..dependencies import ServicesDep

router = APIRouter(tags=['system'])


@router.get('/api/health')
@router.get('/health')
def health():
    return {'status': 'ok', 'groq_configured': bool(settings.groq_api_key),
            'model': settings.groq_model, 'embedding_model': settings.embedding_model,
            'index_backend': 'qdrant', 'reranker_model': settings.reranker_model}


@router.get('/api/documents')
def documents(services: ServicesDep):
    return {**services.ingestion.report(), 'inventory': services.ingestion.inventory()}
