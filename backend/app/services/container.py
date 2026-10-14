from ..embeddings.bge_embeddings import BGEEmbeddings
from ..ingestion.converter import OfficeConverter
from ..ingestion.parser import DoclingParser
from ..ingestion.chunker import StructuredChunker
from ..vectorstore.qdrant_store import QdrantStore
from ..retrieval.retriever import Retriever
from ..retrieval.reranker import BGEReranker
from .ingestion_service import IngestionService
from .search_service import SearchService


class Services:
    def __init__(self, settings):
        self.settings = settings
        self.embeddings = BGEEmbeddings(settings)
        self.store = QdrantStore(settings)
        self.reranker = BGEReranker(settings)
        self.ingestion = IngestionService(settings, OfficeConverter(settings), DoclingParser(),
            StructuredChunker(settings, self.embeddings), self.embeddings, self.store)
        self.search = SearchService(Retriever(self.embeddings, self.store, settings),
                                    self.reranker, settings, lock=self.ingestion.lock)

    def close(self):
        self.store.close()
