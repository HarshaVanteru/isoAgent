import os

from app.core.config import Settings
from app.core.tracing import configure_tracing


def isolate(monkeypatch):
    for key in ('LANGSMITH_TRACING', 'LANGCHAIN_TRACING_V2', 'LANGSMITH_API_KEY',
                'LANGSMITH_PROJECT', 'LANGSMITH_ENDPOINT', 'LANGSMITH_WORKSPACE_ID'):
        monkeypatch.setenv(key, '')


def test_native_tracing_configuration_is_idempotent(monkeypatch):
    isolate(monkeypatch)
    settings = Settings(_env_file=None, langsmith_tracing=True,
                        langsmith_api_key='test-key', langsmith_project='test-project')
    configure_tracing(settings)
    before = dict(os.environ)
    configure_tracing(settings)
    assert dict(os.environ) == before
    assert os.environ['LANGSMITH_TRACING'] == 'true'
    assert os.environ['LANGSMITH_API_KEY'] == 'test-key'
    assert os.environ['LANGSMITH_PROJECT'] == 'test-project'


def test_empty_key_disables_tracing_and_legacy_flag(monkeypatch):
    isolate(monkeypatch)
    monkeypatch.setenv('LANGCHAIN_TRACING_V2', 'true')
    configure_tracing(Settings(_env_file=None, langsmith_tracing=True, langsmith_api_key=''))
    assert os.environ['LANGSMITH_TRACING'] == 'false'
    assert os.environ['LANGCHAIN_TRACING_V2'] == 'false'
