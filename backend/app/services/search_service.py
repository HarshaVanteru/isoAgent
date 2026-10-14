import logging
from contextlib import nullcontext
from ..models.responses import SearchResponse
from ..utils.text_utils import chunk_identity

log = logging.getLogger(__name__)


class SearchService:
    def __init__(self, retriever, reranker, settings, lock=None):
        self.retriever, self.reranker, self.settings = retriever, reranker, settings
        self.lock = lock

    def search(self, query, top_k=None, filters=None):
        with self.lock or nullcontext():
            return self._search(query, top_k, filters)

    def _search(self, query, top_k=None, filters=None):
        log.info('Search query received (%s characters)', len(query))
        count = top_k or self.settings.final_result_limit
        candidates = self.retriever.retrieve(query, max(count, self.settings.vector_search_limit), filters or {})
        log.info('Search retrieved %s candidates', len(candidates))
        results = self.rerank_candidates(query, candidates, top_k=count)
        log.info('Search returned %s reranked results', len(results))
        return SearchResponse(query=query, results=results)

    def retrieve_candidates(self, queries, filters=None):
        """Fuse ranks across query variants and deduplicate before reranking."""
        with self.lock or nullcontext():
            merged, ranks = {}, {}
            queries = list(dict.fromkeys(queries))[:self.settings.multi_query_limit]
            if hasattr(self.retriever, 'retrieve_many'):
                batches = self.retriever.retrieve_many(queries, self.settings.vector_search_limit, filters or {})
            else:
                batches = [self.retriever.retrieve(query, self.settings.vector_search_limit, filters or {}) for query in queries]
            for hits in batches:
                seen = set()
                for rank, hit in enumerate(hits, 1):
                    identity = chunk_identity(hit.model_dump())
                    if identity in seen:
                        continue
                    seen.add(identity)
                    ranks[identity] = ranks.get(identity, 0.0) + 1.0 / (60 + rank)
                    if identity not in merged or hit.vector_score > merged[identity].vector_score:
                        merged[identity] = hit
            ordered = sorted(merged, key=lambda identity: ranks[identity], reverse=True)
            return [merged[identity] for identity in ordered[:self.settings.multi_query_candidate_limit]]

    def rerank_candidates(self, query, candidates, top_k=None):
        with self.lock or nullcontext():
            results = self.reranker.rerank(query, candidates)[:top_k or self.settings.final_result_limit]
            for i, hit in enumerate(results):
                hit.citation = i + 1
            return results
