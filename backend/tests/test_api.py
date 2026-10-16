from uuid import uuid4

from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import MemorySaver

from app.conversation.graph import build_graph
from app.main import app
from tests.test_graph import FakeIndex, FakeLLM


def test_api_answers_and_followups_without_approval(monkeypatch):
    from app import main
    monkeypatch.setattr(main.settings, 'groq_api_key', 'test-key')
    with TestClient(app) as client:
        app.state.graph = build_graph(FakeIndex(), FakeLLM(), MemorySaver())
        thread_id = client.post('/api/threads').json()['thread_id']
        base = f'/api/threads/{thread_id}'
        assert client.get(f'/api/threads/{uuid4()}').status_code == 404
        assert client.post(base + '/messages', json={'question': '   '}).status_code == 422
        response = client.post(base + '/messages', json={'question': 'Suppliers?', 'category': 'Purchasing'})
        assert response.status_code == 200
        result = response.json()
        assert not result['pending_review'] and not result['pending_clarification']
        assert result['answer'] == 'Evaluate suppliers annually [1].'
        assert len(result['messages']) == 2
        assert result['category'] == 'Purchasing'
        assert client.get(base).json()['category'] == 'Purchasing'
        response = client.post(base + '/messages', json={'question': 'How often?'})
        assert response.status_code == 200 and len(response.json()['messages']) == 4
        assert client.post(base + '/review', json={'action': 'approve'}).status_code == 409


def test_query_requires_separate_ingestion(monkeypatch):
    from app import main
    monkeypatch.setattr(main.index, 'report', lambda: {'chunks': 0})
    monkeypatch.setattr(main.settings, 'groq_api_key', 'test-key')
    with TestClient(app) as client:
        app.state.graph = build_graph(main.index, FakeLLM(), MemorySaver())
        assert client.post('/api/ingest').status_code == 404
        response = client.post(f'/api/threads/{uuid4()}/messages',
                               json={'question': 'Suppliers?'})
        assert response.status_code == 409
        assert 'python -m app.ingest' in response.json()['detail']


def test_saved_review_draft_is_returned_as_answer_without_approval():
    from langgraph.graph import START, END, StateGraph
    from app.conversation.state import ChatState
    saver = MemorySaver()
    thread_id = uuid4()
    config = {'configurable': {'thread_id': str(thread_id)}}
    old = StateGraph(ChatState)
    old.add_node('generate_draft', lambda state: {'draft': 'Saved answer [1].'})
    old.add_node('review', lambda state: {'answer': state['draft']})
    old.add_edge(START, 'generate_draft')
    old.add_edge('generate_draft', 'review')
    old.add_edge('review', END)
    old.compile(checkpointer=saver, interrupt_before=['review']).invoke({'question': 'Suppliers?'}, config)
    llm = FakeLLM()
    with TestClient(app) as client:
        app.state.graph = build_graph(FakeIndex(), llm, saver)
        result = client.get(f'/api/threads/{thread_id}').json()
        assert not result['pending_review']
        assert result['answer'] == 'Saved answer [1].'
        assert len(result['messages']) == 2
        assert not llm.calls
        assert len(client.get(f'/api/threads/{thread_id}').json()['messages']) == 2


def test_greeting_works_without_indexed_documents(monkeypatch):
    from app import main
    monkeypatch.setattr(main.index, 'report', lambda: {'chunks': 0})
    monkeypatch.setattr(main.settings, 'groq_api_key', 'test-key')
    with TestClient(app) as client:
        app.state.graph = build_graph(main.index, FakeLLM(), MemorySaver())
        response = client.post(f'/api/threads/{uuid4()}/messages', json={'question': 'hello'})
        assert response.status_code == 200
        body = response.json()
        assert not body['pending_review'] and not body['pending_clarification']
        assert body['answer'].startswith('Hello!')
        assert body['sources'] == []
        assert not body['messages'][-1]['reviewed']


def test_clarification_api_resume_and_conflicts(monkeypatch):
    from app import main
    monkeypatch.setattr(main.settings, 'groq_api_key', 'test-key')
    llm = FakeLLM(analyses=[
        {'clear': False, 'standalone_query': 'control', 'clarification_question': 'Which procedure?'},
        {'clear': True, 'standalone_query': 'Supplier control', 'clarification_question': ''}])
    with TestClient(app) as client:
        app.state.graph = build_graph(FakeIndex(), llm, MemorySaver())
        base = f'/api/threads/{uuid4()}'
        response = client.post(base + '/messages', json={'question': 'How is it controlled?'})
        assert response.status_code == 200
        assert response.json()['pending_clarification']
        assert not response.json()['pending_review']
        assert client.get(base).json()['clarification_question'] == 'Which procedure?'
        assert client.post(base + '/messages', json={'question': 'new message'}).status_code == 409
        assert client.post(base + '/review', json={'action': 'approve'}).status_code == 409
        assert client.post(base + '/clarify', json={'answer': '  '}).status_code == 422
        result = client.post(base + '/clarify', json={'answer': 'Supplier control'}).json()
        assert not result['pending_review'] and not result['pending_clarification']
        assert result['clarification_history'][0]['answer'] == 'Supplier control'
        assert client.post(base + '/clarify', json={'answer': 'again'}).status_code == 409
        assert len(result['messages']) == 4
        assert not result['messages'][-1]['reviewed']
        assert result['answer'] == 'Evaluate suppliers annually [1].'
