from pathlib import Path

from app.core import config


def test_relative_paths_resolve_from_backend_directory():
    backend = Path(config.__file__).resolve().parents[2]
    settings = config.Settings(_env_file=None, data_dir='data', document_dir='library', qdrant_path='qdrant')
    assert config.BACKEND_DIR == backend
    assert config.Settings.model_config['env_file'] == backend / '.env'
    assert settings.data_dir == backend / 'data'
    assert settings.document_dir == backend / 'library'
    assert settings.qdrant_path == str(backend / 'qdrant')
