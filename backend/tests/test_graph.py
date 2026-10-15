import sqlite3
import json
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage
from langgraph.checkpoint.sqlite import SqliteSaver

from app.conversation.graph import build_graph


class FakeIndex:
    def __init__(self):
        self.queries = []

    def retrieve(self, query, category):
        self.queries.append((query, category))
        return [{'text': 'Evaluate suppliers annually.', 'citation': 1, 'score': .8,
                 'metadata': {'source': 'supplier.docx', 'page': 2, 'chunk_id': 'test'}}]

    def retrieve_candidates(self, queries, category=''):
        return self.retrieve(queries[0], category)

    def rerank_candidates(self, query, candidates):
        return candidates


class FakeLLM:
    def __init__(self, analyses=None, qualities=None, variants=None):
        self.calls = []
        self.answer_calls = []
        self.analyses = list(analyses or [])
        self.qualities = list(qualities or [])
        self.variants = variants if variants is not None else ['supplier evaluation procedure']

    def with_structured_output(self, schema, **kwargs):
        def invoke(messages):
            self.calls.append(messages)
            if schema.__name__ == 'ConversationRoute':
                return schema(route='conversation' if messages[-1].content.lower() in ('hello', 'hi', 'thanks') else 'document')
            if schema.__name__ == 'QueryAnalysis':
                if self.analyses:
                    return schema.model_validate(self.analyses.pop(0))
                question = json.loads(messages[-1].content)['question']
                query = 'How often should suppliers be evaluated?' if question == 'How often?' else question
                return schema(clear=True, standalone_query=query, clarification_question='')
            if schema.__name__ == 'QueryVariants':
                return schema(queries=self.variants)
            if schema.__name__ == 'RetrievalQuality':
                if self.qualities:
                    return schema.model_validate(self.qualities.pop(0))
                return schema(sufficient=True, supporting_citations=[1], reason='Explicit supporting passage')
            raise AssertionError(schema)
        return SimpleNamespace(invoke=invoke)

    def invoke(self, messages):
        self.calls.append(messages)
        self.answer_calls.append(messages)
        if 'Respond briefly' in messages[0].content:
            return AIMessage(content='Hello! I can help you search your ISO documents.')
        assert '"page": 2' in messages[0].content
        return AIMessage(content='Evaluate suppliers annually [1].')


def test_automatic_answer_persists_and_supports_followups(tmp_path):
    path = tmp_path / 'checkpoints.sqlite'
    config = {'configurable': {'thread_id': 'test'}}
    llm, index = FakeLLM(), FakeIndex()
    with sqlite3.connect(path, check_same_thread=False) as connection:
        graph = build_graph(index, llm, SqliteSaver(connection))
        result = graph.invoke({'question': 'Supplier evaluation?', 'category': 'Purchasing'}, config)
        assert result['answer'] == 'Evaluate suppliers annually [1].'
        assert not graph.get_state(config).next
        assert len(result['messages']) == 2
        assert result['messages'][-1].additional_kwargs['reviewed'] is False
    with sqlite3.connect(path, check_same_thread=False) as connection:
        graph = build_graph(index, llm, SqliteSaver(connection))
        assert graph.get_state(config).values['answer'] == result['answer']
        followup = graph.invoke({'question': 'How often?', 'category': ''}, config)
        assert len(followup['messages']) == 4
        assert any(query == 'How often should suppliers be evaluated?' for query, _ in index.queries)
        assert any(m.type == 'ai' and m.content == result['answer'] for m in llm.answer_calls[-1][1:])


def test_no_evidence_does_not_hallucinate():
    from langgraph.checkpoint.memory import MemorySaver
    class EmptyIndex(FakeIndex):
        def retrieve(self, *args):
            return []
    llm = FakeLLM()
    graph = build_graph(EmptyIndex(), llm, MemorySaver())
    result = graph.invoke({'question': 'Unknown'}, {'configurable': {'thread_id': 'empty'}})
    assert 'could not find supporting passages' in result['draft']
    assert not llm.answer_calls
    assert result['retrieval_attempts'] == 2


@pytest.mark.parametrize('corrected,accepted', [
    ('Evaluate suppliers annually [3].', True),
    ('Evaluate suppliers annually [1, 3].', True),
    ('Evaluate suppliers annually [1; 3].', True),
    ('Evaluate suppliers annually [ 3 ].', True),
    ('Evaluate suppliers annually [1, 99].', False),
    ('Evaluate suppliers annually [1-3].', False),
    ('Evaluate suppliers annually [2].', False),
    ('Evaluate suppliers annually.', False),
])
def test_citation_retry_preserves_nonconsecutive_source_numbers(corrected, accepted):
    from app.conversation.nodes import ConversationNodes

    class DraftLLM:
        def __init__(self):
            self.calls = []

        def invoke(self, messages):
            self.calls.append(messages)
            return AIMessage(content='Evaluate suppliers annually [2].' if len(self.calls) == 1 else corrected)

    nodes = object.__new__(ConversationNodes)
    nodes.llm = DraftLLM()
    sources = [{'citation': n, 'text': 'Evaluate suppliers annually.', 'metadata': {}} for n in (1, 3)]
    result = nodes.generate_draft({'question': 'How often?', 'sources': sources, 'supporting_citations': [1, 3]})
    assert len(nodes.llm.calls) == 2
    assert '[1], [3]' in nodes.llm.calls[-1][-1].content
    assert result['sources'] == sources
    if accepted:
        from app.conversation.nodes import normalize_citations
        assert result['draft'] == normalize_citations(corrected)
    else:
        assert result['evidence_sufficient'] is False
        assert 'could not produce an answer with valid source citations' in result['draft']
