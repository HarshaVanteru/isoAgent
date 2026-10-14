import hashlib
import json


def chunk_identity(source):
    metadata = source.get('metadata', {})
    return metadata.get('chunk_id') or hashlib.sha256(
        json.dumps([metadata.get('source'), source['text']], ensure_ascii=False).encode()).hexdigest()
