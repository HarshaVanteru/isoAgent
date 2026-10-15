"""Opt-in Groq smoke check using synthetic policy text only."""
import os
from uuid import uuid4
import pytest

pytestmark = pytest.mark.skipif(os.getenv('RUN_GROQ_TESTS') != '1', reason='Opt-in live Groq workflow')


def test_live_router_analysis_quality_and_clarification():
    from langchain_groq import ChatGroq
    from langgraph.checkpoint.memory import MemorySaver
    from app.core.config import settings
    from app.conversation.graph import build_graph
    from tests.test_graph import FakeIndex
    if not settings.groq_api_key:
        pytest.skip('GROQ_API_KEY not configured')
    llm = ChatGroq(model=settings.groq_model, api_key=settings.groq_api_key,
                  temperature=0, max_tokens=2048, timeout=30, max_retries=0)
    graph = build_graph(FakeIndex(), llm, MemorySaver(), settings=settings)
    config = {'configurable': {'thread_id': str(uuid4())}}
    result = graph.invoke({'question': 'Hello!'}, config)
    assert result['route'] == 'conversation'
    assert result['answer'] and not graph.get_state(config).next
    result = graph.invoke({'question': 'According to our policy, how often must suppliers be evaluated?'}, config)
    assert result['route'] == 'document'
    assert result['evidence_sufficient'], {key: result.get(key) for key in
        ('steps', 'query_clear', 'clarification_question', 'quality_reason', 'supporting_citations')}
    assert 'annually' in result['draft'].lower()
    assert '[1]' in result['draft']
    assert not graph.get_state(config).next
    # A fresh ambiguous request must pause before searching and persist its prompt.
    config = {'configurable': {'thread_id': str(uuid4())}}
    result = graph.invoke({'question': 'I need a form, but I have not specified which topic or department. Which form should I use?'}, config)
    assert graph.get_state(config).next == ('await_clarification',)
    assert result['clarification_question']
    graph.update_state(config, {'clarification_reply': 'The supplier evaluation form; I want to know how often we should evaluate suppliers.'})
    result = graph.invoke(None, config)
    assert not graph.get_state(config).next
    assert result['clarification_history']
