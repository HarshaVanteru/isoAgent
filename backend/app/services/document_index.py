"""Document index facade shared by the CLI, graph, and API."""
from .container import Services
from ..models.responses import SearchHit


class DocumentIndex:
    def __init__(self, settings):
        self.settings = settings
        self.services = Services(settings)

    def report(self):
        return self.services.ingestion.report()

    def inventory(self):
        return self.services.ingestion.inventory()

    def ingest(self):
        return self.services.ingestion.ingest_folder()

    def retrieve(self, query, category=''):
        filters = {'category': category} if category else {}
        response = self.services.search.search(query, filters=filters)
        return [hit.model_dump() for hit in response.results]

    def retrieve_candidates(self, queries, category=''):
        filters = {'category': category} if category else {}
        return [hit.model_dump() for hit in self.services.search.retrieve_candidates(queries, filters)]

    def rerank_candidates(self, query, candidates):
        hits = [SearchHit.model_validate(hit) for hit in candidates]
        return [hit.model_dump() for hit in self.services.search.rerank_candidates(query, hits)]
