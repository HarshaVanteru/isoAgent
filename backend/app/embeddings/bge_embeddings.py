import logging
from threading import RLock
from ..core.errors import ModelError

log = logging.getLogger(__name__)


class BGEEmbeddings:
    def __init__(self, settings):
        self.settings = settings
        self._model = None
        self._lock = RLock()

    @property
    def model(self):
        with self._lock:
            if self._model is None:
                try:
                    from sentence_transformers import SentenceTransformer
                    self._model = SentenceTransformer(self.settings.embedding_model,
                        device=self.settings.model_device,
                        cache_folder=str(self.settings.model_cache_dir),
                        local_files_only=self.settings.model_local_files_only)
                except Exception as exc:
                    log.exception('Embedding model initialization failed')
                    raise ModelError('Embedding model unavailable; check model cache and server logs') from exc
            return self._model

    @property
    def dimension(self):
        return int(self.model.get_embedding_dimension())

    def embed_documents(self, texts):
        if not texts:
            return []
        try:
            with self._lock:
                log.info('Embedding batch: %s chunks', len(texts))
                return self.model.encode(texts, batch_size=self.settings.embedding_batch_size,
                    normalize_embeddings=True, show_progress_bar=False).tolist()
        except ModelError:
            raise
        except Exception as exc:
            log.exception('Embedding failed')
            raise ModelError('Embedding failed; check server logs') from exc

    def embed_query(self, query):
        return self.embed_documents([query])[0]
