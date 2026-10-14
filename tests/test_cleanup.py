import os
import shutil
import pytest

from backend.app.utils.cleanup import remove_tree
from backend.app.ingestion.converter import OfficeConverter
from backend.app.core.config import Settings


def test_cleanup_retries_transient_directory_busy(tmp_path, monkeypatch):
    directory = tmp_path / 'work'
    directory.mkdir()
    original = shutil.rmtree
    calls = []
    def busy_then_remove(path, **kwargs):
        calls.append(path)
        if len(calls) < 3:
            raise OSError(145, 'Directory not empty')
        return original(path, **kwargs)
    monkeypatch.setattr(shutil, 'rmtree', busy_then_remove)
    remove_tree(directory, tmp_path, delay=0)
    assert len(calls) == 3 and not directory.exists()


def test_cleanup_tolerates_child_disappearing(tmp_path, monkeypatch):
    directory = tmp_path / 'work'
    directory.mkdir()
    def racing_remove(path, onexc):
        onexc(os.unlink, str(path / 'already-deleted'), FileNotFoundError('gone'))
        path.rmdir()
    monkeypatch.setattr(shutil, 'rmtree', racing_remove)
    remove_tree(directory, tmp_path)
    assert not directory.exists()


def test_cleanup_does_not_hide_permanent_failure_or_escape_root(tmp_path, monkeypatch):
    directory = tmp_path / 'work'
    directory.mkdir()
    def locked(*args, **kwargs):
        raise PermissionError('locked')
    monkeypatch.setattr(shutil, 'rmtree', locked)
    with pytest.raises(PermissionError):
        remove_tree(directory, tmp_path, attempts=2, delay=0)
    with pytest.raises(ValueError):
        remove_tree(tmp_path, tmp_path)
    with pytest.raises(ValueError):
        remove_tree(tmp_path.parent, tmp_path)


@pytest.mark.skipif(os.name != 'nt', reason='Windows console launcher')
def test_configured_gui_launcher_uses_console_sibling(tmp_path):
    exe, console = tmp_path / 'soffice.exe', tmp_path / 'soffice.com'
    exe.touch()
    console.touch()
    converter = OfficeConverter(Settings(_env_file=None, libreoffice_path=str(exe)))
    assert converter.executable() == str(console)


@pytest.mark.skipif(os.name != 'nt', reason='Windows long-path cleanup')
def test_cleanup_removes_profile_paths_longer_than_260_characters(tmp_path):
    from pathlib import Path
    base = tmp_path / 'profile'
    base.mkdir()
    deep = base
    for _ in range(8):
        deep = deep / ('registry-' + 'x' * 30)
    extended = Path('\\\\?\\' + str(deep))
    extended.mkdir(parents=True)
    (extended / 'dictionaries.xcu').write_text('test')
    remove_tree(base, tmp_path)
    assert not base.exists()
