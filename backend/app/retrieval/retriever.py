class Retriever:
    def __init__(self, embeddings, store, settings):
        self.embeddings, self.store, self.settings = embeddings, store, settings

    def retrieve(self, query, limit, filters):
        vector = self.embeddings.embed_query(query)
        self.store.ensure_collection(len(vector))
        return self.store.search(vector, limit, filters)

    def retrieve_many(self, queries, limit, filters):
        if not queries:
            return []
        vectors = self.embeddings.embed_documents(queries)
        self.store.ensure_collection(len(vectors[0]))
        return [self.store.search(vector, limit, filters) for vector in vectors]
