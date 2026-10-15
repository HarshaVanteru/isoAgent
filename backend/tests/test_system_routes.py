from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import get_conversations
from app.api.routes import system
from app.core.config import Settings
from app.core.errors import IndexConfigurationError
from app.main import app


def test_system_router_owns_health_and_library_overview():
    paths = {route.path for route in system.router.routes}
    assert paths == {'/health', '/api/health', '/api/documents'}


def test_health_is_served_on_both_paths():
    with TestClient(app) as client:
        for path in ('/health', '/api/health'):
            body = client.get(path).json()
            assert body['status'] == 'ok'
            assert body['index_backend'] == 'qdrant'


def test_documents_overview_combines_report_and_inventory(monkeypatch):
    with TestClient(app) as client:
        ingestion = app.state.services.ingestion
        monkeypatch.setattr(ingestion, 'report', lambda: {'files': [], 'chunks': 0, 'indexed_at': None})
        monkeypatch.setattr(ingestion, 'inventory', lambda: [{'source': 'a.pdf', 'file_type': '.pdf'}])
        body = client.get('/api/documents').json()
        assert body['chunks'] == 0
        assert body['inventory'] == [{'source': 'a.pdf', 'file_type': '.pdf'}]


def test_cors_origins_parse_from_comma_separated_setting():
    settings = Settings(_env_file=None, cors_origins=' http://a:1 , http://b:2,, ')
    assert settings.cors_origin_list == ['http://a:1', 'http://b:2']


def test_cors_allows_default_frontend_origin():
    with TestClient(app) as client:
        response = client.options('/api/health', headers={
            'Origin': 'http://127.0.0.1:5173', 'Access-Control-Request-Method': 'GET'})
        assert response.headers['access-control-allow-origin'] == 'http://127.0.0.1:5173'


def test_conversation_dependency_requires_initialized_service():
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
    with pytest.raises(IndexConfigurationError):
        get_conversations(request)
