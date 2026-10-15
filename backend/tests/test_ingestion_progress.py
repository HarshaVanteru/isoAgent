import pytest

from app.core.errors import ModelError
from tests.test_local_rag import pipeline, make_doc


def test_failed_file_does_not_discard_successes_or_stop_later_files(pipeline, monkeypatch):
    p = pipeline
    make_doc(p.settings.document_dir / 'a.docx')
    (p.settings.document_dir / 'b.docx').write_bytes(b'broken')
    make_doc(p.settings.document_dir / 'c.docx', text='Quality policy')
    report = p.ingestion.ingest_folder()
    entries = {entry['source']: entry for entry in report['files']}
    assert entries['a.docx']['status'] == 'indexed'
    assert entries['b.docx']['status'] == 'error'
    assert entries['c.docx']['status'] == 'indexed'
    assert p.store.count() == 2
    assert not list(p.settings.data_dir.glob('.ingestion-rollback-*'))
    # A rerun reuses successful documents instead of embedding them again.
    calls = p.embeddings.calls
    p.ingestion.ingest_folder()
    assert p.embeddings.calls == calls


@pytest.mark.parametrize('error', [KeyboardInterrupt(), ModelError('Model unavailable')])
def test_interruption_or_infrastructure_failure_keeps_completed_documents(pipeline, monkeypatch, error):
    p = pipeline
    make_doc(p.settings.document_dir / 'a.docx')
    make_doc(p.settings.document_dir / 'b.docx', text='Quality policy')
    embed = p.embeddings.embed_documents
    calls = []
    def fail_second(texts):
        calls.append(texts)
        if len(calls) == 2:
            raise error
        return embed(texts)
    monkeypatch.setattr(p.embeddings, 'embed_documents', fail_second)
    with pytest.raises(type(error)):
        p.ingestion.ingest_folder()
    assert p.store.count() == 1
    assert p.ingestion.report()['files'][0]['source'] == 'a.docx'
    assert p.ingestion.report()['files'][0]['status'] == 'indexed'


def test_folder_api_returns_successes_and_file_errors_together(pipeline):
    from fastapi.testclient import TestClient
    from app.main import app
    from app.api.dependencies import get_services
    p = pipeline
    make_doc(p.settings.document_dir / 'a.docx')
    (p.settings.document_dir / 'b.docx').write_bytes(b'broken')
    make_doc(p.settings.document_dir / 'c.docx', text='Quality policy')
    app.dependency_overrides[get_services] = lambda: p
    try:
        with TestClient(app) as client:
            response = client.post('/documents/ingest-folder', json={})
            assert response.status_code == 200
            entries = {entry['source']: entry for entry in response.json()['files']}
            assert entries['a.docx']['status'] == entries['c.docx']['status'] == 'indexed'
            assert entries['b.docx']['status'] == 'error'
            assert response.json()['chunks'] == p.store.count() == 2
    finally:
        app.dependency_overrides.clear()
