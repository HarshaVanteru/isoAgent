import sqlite3
import pytest
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.sqlite import SqliteSaver

from app.core.config import Settings
from app.conversation.graph import build_graph
from tests.test_graph import FakeIndex, FakeLLM

CONFIG = {'configurable': {'thread_id': 'flow'}}
POOR = {'sufficient': False, 'supporting_citations': [], 'reason': 'Missing explicit evidence'}
GOOD = {'sufficient': True, 'supporting_citations': [1], 'reason': 'Explicit evidence'}
UNCLEAR = {'clear': False, 'standalone_query': 'procedure', 'clarification_question': 'Which procedure?'}
CLEAR = {'clear': True, 'standalone_query': 'Supplier evaluation procedure', 'clarification_question': ''}


class StagedIndex(FakeIndex):
    def __init__(self):
        super().__init__()
        self.candidate_calls = []
        self.rerank_calls = []

    def retrieve_candidates(self, queries, category):
        self.candidate_calls.append((queries, category))
        return super().retrieve(queries[0], category)

    def rerank_candidates(self, query, candidates):
        self.rerank_calls.append(query)
        return candidates


def test_full_flow_expands_deduplicates_and_reranks_once():
    index = StagedIndex()
    llm = FakeLLM(variants=['Supplier evaluation?', 'SUPPLIER EVALUATION?', 'supplier approval', 'extra'])
    graph = build_graph(index, llm, MemorySaver())
    result = graph.invoke({'question': 'Supplier evaluation?', 'category': 'Purchasing'}, CONFIG)
    assert result['queries'] == ['Supplier evaluation?', 'supplier approval', 'extra']
    assert index.candidate_calls[0][1] == 'Purchasing'
    assert len(index.rerank_calls) == 1
    assert result['steps'] == ['conversation_router', 'query_analysis', 'query_expansion',
        'multi_query_generation', 'retrieval', 'reranking', 'retrieval_quality_check', 'generate_draft', 'finalize_answer']
    assert not graph.get_state(CONFIG).next
    assert result['evidence_sufficient']


def test_poor_evidence_retries_once_then_recovers():
    index = StagedIndex()
    llm = FakeLLM(qualities=[POOR, GOOD])
    graph = build_graph(index, llm, MemorySaver())
    result = graph.invoke({'question': 'Supplier evaluation?'}, CONFIG)
    assert result['retrieval_attempts'] == 2
    assert result['retry_count'] == 1
    assert len(index.rerank_calls) == 2
    assert result['steps'].count('reformulate_query') == 1
    assert len(llm.answer_calls) == 1


@pytest.mark.parametrize('budget', [0, 1, 2])
def test_retry_budget_abstains_instead_of_forcing_answer(budget):
    index = StagedIndex()
    llm = FakeLLM(qualities=[POOR] * 3)
    graph = build_graph(index, llm, MemorySaver(), Settings(_env_file=None, retrieval_max_retries=budget))
    result = graph.invoke({'question': 'Supplier evaluation?'}, CONFIG)
    assert result['retrieval_attempts'] == budget + 1
    assert 'not provide enough evidence' in result['draft']
    assert not llm.answer_calls
    assert not graph.get_state(CONFIG).next


def test_invalid_supporting_citations_cannot_pass_quality_check():
    llm = FakeLLM(qualities=[{'sufficient': True, 'supporting_citations': [99], 'reason': 'claims evidence'}])
    graph = build_graph(StagedIndex(), llm, MemorySaver(), Settings(_env_file=None, retrieval_max_retries=0))
    result = graph.invoke({'question': 'Supplier evaluation?'}, CONFIG)
    assert not result['evidence_sufficient']
    assert not llm.answer_calls


def test_malformed_quality_decision_does_not_generate_answer():
    from pydantic import ValidationError
    llm = FakeLLM(qualities=[{'sufficient': True}])
    graph = build_graph(StagedIndex(), llm, MemorySaver())
    with pytest.raises(ValidationError):
        graph.invoke({'question': 'Supplier evaluation?'}, CONFIG)
    assert not llm.answer_calls


def test_generated_citations_must_refer_to_actual_supporting_sources():
    from langchain_core.messages import AIMessage
    class InvalidCitationLLM(FakeLLM):
        def invoke(self, messages):
            return AIMessage(content='Unsupported generated claim [99].')
    graph = build_graph(StagedIndex(), InvalidCitationLLM(), MemorySaver())
    result = graph.invoke({'question': 'Supplier evaluation?'}, CONFIG)
    assert 'Unsupported generated claim' not in result['draft']
    assert 'valid source citations' in result['draft']
    assert not result['evidence_sufficient']


def test_clarification_survives_restart_and_is_reanalyzed(tmp_path):
    path = tmp_path / 'clarification.sqlite'
    index = StagedIndex()
    with sqlite3.connect(path, check_same_thread=False) as connection:
        graph = build_graph(index, FakeLLM(analyses=[UNCLEAR]), SqliteSaver(connection))
        result = graph.invoke({'question': 'Which one should we use?', 'category': 'Quality'}, CONFIG)
        assert graph.get_state(CONFIG).next == ('await_clarification',)
        assert not index.candidate_calls
        assert not result.get('messages')
    llm = FakeLLM(analyses=[CLEAR])
    with sqlite3.connect(path, check_same_thread=False) as connection:
        graph = build_graph(index, llm, SqliteSaver(connection))
        graph.update_state(CONFIG, {'clarification_reply': 'The supplier evaluation form'})
        result = graph.invoke(None, CONFIG)
        assert result['steps'].count('query_analysis') == 2
        assert result['steps'].count('conversation_router') == 1
        assert index.candidate_calls[0][1] == 'Quality'
        assert result['clarification_history'][0]['answer'] == 'The supplier evaluation form'
        assert result['answer'] == result['draft']
        assert len(result['messages']) == 4


def test_existing_review_checkpoint_remains_resumable(tmp_path):
    from langgraph.graph import START, END, StateGraph
    from app.conversation.state import ChatState
    path = tmp_path / 'old-review.sqlite'
    with sqlite3.connect(path, check_same_thread=False) as connection:
        old = StateGraph(ChatState)
        old.add_node('generate_draft', lambda state: {'draft': 'Previously generated draft [1].'})
        old.add_node('review', lambda state: {'answer': state['draft']})
        old.add_edge(START, 'generate_draft')
        old.add_edge('generate_draft', 'review')
        old.add_edge('review', END)
        compiled = old.compile(checkpointer=SqliteSaver(connection), interrupt_before=['review'])
        compiled.invoke({'question': 'Earlier question'}, CONFIG)
    with sqlite3.connect(path, check_same_thread=False) as connection:
        llm = FakeLLM()
        graph = build_graph(FakeIndex(), llm, SqliteSaver(connection))
        result = graph.invoke(None, CONFIG)
        assert result['answer'] == 'Previously generated draft [1].'
        assert len(result['messages']) == 2
        assert not llm.calls


def test_clarification_rounds_are_bounded():
    llm = FakeLLM(analyses=[UNCLEAR] * 3)
    index = StagedIndex()
    graph = build_graph(index, llm, MemorySaver())
    graph.invoke({'question': 'Which one?'}, CONFIG)
    for _ in range(2):
        graph.update_state(CONFIG, {'clarification_reply': 'Not sure'})
        result = graph.invoke(None, CONFIG)
    assert not graph.get_state(CONFIG).next
    assert 'more specific document question' in result['draft']
    assert not index.candidate_calls


def test_small_talk_answers_without_approval():
    graph = build_graph(FakeIndex(), FakeLLM(), MemorySaver())
    result = graph.invoke({'question': 'hello'}, CONFIG)
    assert not graph.get_state(CONFIG).next
    assert result['answer'].startswith('Hello!')
    assert not result['messages'][-1].additional_kwargs['reviewed']


def test_new_turn_clears_previous_sources_and_retry_state():
    llm = FakeLLM(qualities=[POOR, GOOD])
    graph = build_graph(StagedIndex(), llm, MemorySaver())
    graph.invoke({'question': 'Supplier evaluation?'}, CONFIG)
    result = graph.invoke({'question': 'thanks'}, CONFIG)
    assert result['sources'] == [] and result['retrieval_attempts'] == 0
    assert result['clarification_history'] == []
    assert graph.get_state(CONFIG).next == ()
