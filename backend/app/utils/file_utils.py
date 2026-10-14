import hashlib
from pathlib import Path
from ..core.errors import InvalidFile

SUPPORTED = {'.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx',
             '.txt', '.md', '.csv', '.vsd', '.vsdx'}


def document_folder(root: Path, path: str | Path | None = None) -> Path:
    """Resolve a CLI/API folder relative to the configured document library."""
    folder = Path(path) if path else root
    return within_root(folder if folder.is_absolute() else root / folder, root)


def document_inventory(root: Path):
    return [{'source': path.relative_to(root).as_posix(), 'file_type': path.suffix.lower(),
             'size_bytes': path.stat().st_size, 'supported': path.suffix.lower() in SUPPORTED}
            for path in sorted(root.rglob('*'))
            if path.is_file() and path.resolve().is_relative_to(root.resolve())]


def validate_file(path: Path):
    if not path.is_file():
        raise InvalidFile('Document does not exist or is not a file')
    if path.suffix.lower() not in SUPPORTED:
        raise InvalidFile(f'Unsupported document type: {path.suffix.lower()}')
    if not path.stat().st_size:
        raise InvalidFile('Document is empty')


def content_hash(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def within_root(path: Path, root: Path) -> Path:
    resolved = path.resolve()
    if not resolved.is_relative_to(root.resolve()):
        raise InvalidFile('Folder must be inside DOCUMENT_DIR')
    return resolved
