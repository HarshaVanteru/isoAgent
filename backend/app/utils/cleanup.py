"""Bounded cleanup for temporary files that Windows may release asynchronously."""
import shutil
import os
import tempfile
import time
from contextlib import contextmanager
from pathlib import Path


def remove_tree(path, root, attempts=20, delay=0.25):
    path, root = Path(path), Path(root)
    resolved, boundary = path.resolve(), root.resolve()
    if resolved == boundary or not resolved.is_relative_to(boundary) or path.is_symlink() or path.is_junction():
        raise ValueError('Cleanup target must be a non-linked child of the intended directory')
    deletion_path = resolved
    if os.name == 'nt' and not str(resolved).startswith('\\\\?\\'):
        # Old LibreOffice profiles may already exceed MAX_PATH. The extended
        # prefix lets Windows enumerate and remove those existing descendants.
        value = str(resolved)
        deletion_path = Path('\\\\?\\UNC\\' + value[2:] if value.startswith('\\\\') else '\\\\?\\' + value)

    def missing_child_is_ok(function, target, error):
        # LibreOffice/antivirus may delete a child between traversal and unlink.
        if not isinstance(error, FileNotFoundError):
            raise error

    for attempt in range(attempts):
        try:
            shutil.rmtree(deletion_path, onexc=missing_child_is_ok)
            return
        except FileNotFoundError:
            if not path.exists():
                return
            if attempt == attempts - 1:
                raise
        except OSError:
            if attempt == attempts - 1:
                raise
        time.sleep(delay)


@contextmanager
def temporary_directory(parent):
    work = Path(tempfile.mkdtemp(dir=parent))
    try:
        yield work
    finally:
        remove_tree(work, parent)
