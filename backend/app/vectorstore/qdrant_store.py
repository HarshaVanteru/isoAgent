import logging
from functools import wraps
from threading import RLock
from uuid import NAMESPACE_URL, uuid5
from ..core.errors import PipelineError, StorageError, IndexConfigurationError
from ..models.responses import SearchHit

log = logging.getLogger(__name__)


def storage_operation(function):
    @wraps(function)
    def guarded(self, *args, **kwargs):
        try:
            with self._lock:
                return function(self, *args, **kwargs)
        except PipelineError:
            raise
        except Exception as exc:
            log.exception('Qdrant operation failed: %s', function.__name__)
            raise StorageError('Qdrant operation failed; check connection and server logs') from exc
    return guarded


class QdrantStore:
    def __init__(self, settings, client=None):
        self.settings = settings
        self._client = client
        self._lock = RLock()
        self._dimension = None

    @property
    def client(self):
        if self._client is None:
            from qdrant_client import QdrantClient
            if self.settings.qdrant_path:
                self._client = QdrantClient(location=':memory:') if self.settings.qdrant_path == ':memory:' else QdrantClient(path=self.settings.qdrant_path)
            else:
                self._client = QdrantClient(url=self.settings.qdrant_url,
                    api_key=self.settings.qdrant_api_key or None, timeout=self.settings.qdrant_timeout)
        return self._client

    @property
    def collection(self):
        return self.settings.qdrant_collection

    @property
    def signature(self):
        return {'embedding_model': self.settings.embedding_model,
                'chunk_max_tokens': self.settings.chunk_max_tokens, 'pipeline_version': 1}

    @storage_operation
    def ensure_collection(self, dimension):
        from qdrant_client import models as m
        if self._dimension == dimension:
            return
        if not self.client.collection_exists(self.collection):
            self.client.create_collection(self.collection,
                vectors_config=m.VectorParams(size=dimension, distance=m.Distance.COSINE))
            for key in ('document_id', 'category', 'document_type', 'source'):
                if not self.settings.qdrant_path:
                    self.client.create_payload_index(self.collection, key, m.PayloadSchemaType.KEYWORD)
        info = self.client.get_collection(self.collection)
        params = info.config.params.vectors
        if not isinstance(params, m.VectorParams) or params.size != dimension or params.distance != m.Distance.COSINE:
            raise IndexConfigurationError('Qdrant vector configuration differs; use a new collection')
        # A payload signature works in both embedded and server Qdrant versions.
        points, _ = self.client.scroll(self.collection, limit=1, with_payload=True, with_vectors=False)
        if points and points[0].payload.get('_pipeline') != self.signature:
            raise IndexConfigurationError('Index model or chunk settings differ; use a new collection')
        self._dimension = dimension

    @staticmethod
    def filter(values):
        from qdrant_client import models as m
        return m.Filter(must=[m.FieldCondition(key=key, match=m.MatchValue(value=value))
                              for key, value in values.items()])

    @storage_operation
    def exists(self, document_id):
        return self.document(document_id) is not None

    @storage_operation
    def document(self, document_id):
        if not self.client.collection_exists(self.collection):
            return None
        condition = self.filter({'document_id': document_id})
        points, _ = self.client.scroll(self.collection, scroll_filter=condition, limit=1,
                                      with_vectors=False, with_payload=True)
        if not points:
            return None
        count = self.client.count(self.collection, count_filter=condition, exact=True).count
        payload = points[0].payload
        return {'document_id': document_id, 'chunks': count,
                'metadata': {k: v for k, v in payload.items() if k not in {'text', '_pipeline'}}}

    @storage_operation
    def insert(self, chunks, vectors):
        from qdrant_client import models as m
        if len(chunks) != len(vectors):
            raise ValueError('One vector is required per chunk')
        points = []
        for chunk, vector in zip(chunks, vectors, strict=True):
            identity = f"{chunk.metadata['document_id']}:{chunk.metadata['chunk_index']}"
            chunk_id = str(uuid5(NAMESPACE_URL, identity))
            chunk.metadata['chunk_id'] = chunk_id
            points.append(m.PointStruct(id=chunk_id, vector=vector, payload={
                **chunk.metadata, 'text': chunk.text, '_pipeline': self.signature}))
        for offset in range(0, len(points), self.settings.qdrant_batch_size):
            self.client.upsert(self.collection, points[offset:offset + self.settings.qdrant_batch_size], wait=True)
        log.info('Inserted %s vectors', len(points))

    @storage_operation
    def delete_document(self, document_id):
        from qdrant_client import models as m
        if self.client.collection_exists(self.collection):
            self.client.delete(self.collection, points_selector=m.FilterSelector(
                filter=self.filter({'document_id': document_id})), wait=True)

    @storage_operation
    def update_metadata(self, document_id, metadata):
        self.client.set_payload(self.collection, payload=metadata,
            points=self.filter({'document_id': document_id}), wait=True)

    @storage_operation
    def search(self, vector, limit, filters):
        response = self.client.query_points(self.collection, query=vector, limit=limit,
            query_filter=self.filter(filters) if filters else None, with_payload=True)
        return [SearchHit(text=hit.payload['text'], score=hit.score, vector_score=hit.score,
            metadata={k: v for k, v in hit.payload.items() if k not in {'text', '_pipeline'}})
                for hit in response.points]

    @storage_operation
    def count(self):
        if not self.client.collection_exists(self.collection):
            return 0
        return self.client.count(self.collection, exact=True).count

    def close(self):
        with self._lock:
            if self._client is not None:
                self._client.close()
                self._client = None
                self._dimension = None
