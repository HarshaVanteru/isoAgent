from types import SimpleNamespace
import pytest
from backend.app import ingest
from backend.app.core.errors import StorageError


@pytest.mark.parametrize('error,expected', [(StorageError('Database unavailable'), 1), (KeyboardInterrupt(), 130)])
def test_cli_failure_stops_returns_nonzero_and_closes_services(monkeypatch, error, expected):
    closed = []
    def fail(*args):
        raise error
    index = SimpleNamespace(services=SimpleNamespace(
        ingestion=SimpleNamespace(ingest_folder=fail), close=lambda: closed.append(True)))
    monkeypatch.setattr(ingest, 'DocumentIndex', lambda settings: index)
    monkeypatch.setattr('sys.argv', ['ingest'])
    assert ingest.main() == expected
    assert closed == [True]


def test_cli_reports_partial_failure_without_discarding_report(monkeypatch, capsys):
    report = {'files': [{'source': 'good.docx', 'status': 'indexed'},
                        {'source': 'bad.docx', 'status': 'error'}], 'chunks': 1}
    index = SimpleNamespace(services=SimpleNamespace(ingestion=SimpleNamespace(
        ingest_folder=lambda *args: report), close=lambda: None))
    monkeypatch.setattr(ingest, 'DocumentIndex', lambda settings: index)
    monkeypatch.setattr('sys.argv', ['ingest'])
    assert ingest.main() == 1
    assert 'good.docx' in capsys.readouterr().out
