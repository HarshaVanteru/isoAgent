import re
from pathlib import Path


def document_type(path: Path) -> str:
    name = str(path).lower()
    if path.suffix.lower() in {'.xlsx', '.xls'}:
        return 'spreadsheet'
    if path.suffix.lower() == '.pptx':
        return 'presentation'
    if 'form' in name or re.search(r'\bof-', path.name, re.I):
        return 'form'
    if 'procedure' in name or 'sop' in name:
        return 'procedure'
    if 'manual' in name:
        return 'manual'
    return 'document'


def source_metadata(source, name):
    parts = Path(source).parts
    path = Path(name)
    code = re.search(r'\b(?:[A-Z]{2,}-)?(?:OP|OF|QM)(?:-[A-Z])?-\d+\b', path.stem, re.I)
    return dict(document_name=name, filename=name, source_file=source, source=source,
                file_type=path.suffix.lower(), document_type=document_type(Path(source)),
                document_code=code.group() if code else None,
                category=parts[0] if len(parts) > 1 else 'General',
                department=parts[-2] if len(parts) > 2 else 'General')


def enrich(chunks, path, document_id, source, timestamp):
    common = dict(**source_metadata(source, path.name), document_id=document_id,
                  sha256=document_id, indexed_at=timestamp,
                  modified_at=path.stat().st_mtime)
    for i, chunk in enumerate(chunks):
        chunk.metadata = {**common, **chunk.metadata, 'chunk_index': i}
    return chunks
