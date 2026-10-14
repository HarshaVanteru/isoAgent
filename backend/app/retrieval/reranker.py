import logging
from threading import RLock
from ..core.errors import ModelError

log = logging.getLogger(__name__)


class BGEReranker:
    def __init__(self, settings):
        self.settings = settings
        self._model = None
        self._lock = RLock()

    def rerank(self, query, candidates):
        if not candidates:
            return []
        try:
            with self._lock:
                if self._model is None:
                    from sentence_transformers import CrossEncoder
                    self._model = CrossEncoder(self.settings.reranker_model,
                        device=self.settings.model_device,
                        cache_folder=str(self.settings.model_cache_dir),
                        max_length=self.settings.reranker_max_tokens,
                        local_files_only=self.settings.model_local_files_only)
                import torch
                scores = self._model.predict([(query, hit.text) for hit in candidates],
                    batch_size=self.settings.reranker_batch_size,
                    activation_fn=torch.nn.Identity(), show_progress_bar=False)
            for hit, score in zip(candidates, scores, strict=True):
                hit.score = float(score)
            return sorted(candidates, key=lambda hit: hit.score, reverse=True)
        except Exception as exc:
            log.exception('Reranking failed')
            raise ModelError('Reranking model unavailable or inference failed; check server logs') from exc
