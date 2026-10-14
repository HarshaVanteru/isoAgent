"""Conversation execution, checkpoint snapshots, and clarification handling."""
import logging
import threading
from contextlib import contextmanager
from uuid import UUID
from fastapi import HTTPException
from ..core.errors import PipelineError
from ..models.requests import Question, ClarificationReply, Review

def config(thread_id: UUID):
    return {'configurable': {'thread_id': str(thread_id)}}


@contextmanager
def graph_operation(thread_id):
    try:
        yield
    except PipelineError:
        raise
    except Exception as exc:
        logging.exception('Conversation operation failed for thread %s', thread_id)
        raise HTTPException(502, 'Conversation processing failed. Check server logs and Groq credentials; start a new conversation to retry.') from exc


class ConversationService:
    def __init__(self, app, settings):
        self.app = app
        self.settings = settings
        self.lock = threading.Lock()

    def require_chat_model(self):
        if not self.settings.groq_api_key:
            raise HTTPException(503, 'Set GROQ_API_KEY in the project .env file, then restart the backend.')

    def snapshot(self, thread_id):
        state = self.app.state.graph.get_state(config(thread_id))
        if not state.values:
            raise HTTPException(404, 'Conversation not found')
        if state.next == ('review',):
            # Publish existing saved drafts without asking for approval.
            self.app.state.graph.invoke(None, config(thread_id))
            state = self.app.state.graph.get_state(config(thread_id))
        pending = 'review' in state.next
        values = state.values
        return {'thread_id': str(thread_id), 'pending_review': pending,
                'pending_clarification': 'await_clarification' in state.next,
                'clarification_question': values.get('clarification_question', ''),
                'clarification_history': values.get('clarification_history', []),
                'retrieval_attempts': values.get('retrieval_attempts', 0),
                'evidence_sufficient': values.get('evidence_sufficient', False),
                'workflow_steps': values.get('steps', []),
                'search_queries': values.get('queries', []),
                'messages': [{'role': 'user' if m.type == 'human' else 'assistant', 'content': m.content,
                              'reviewed': m.additional_kwargs.get('reviewed', True) if m.type == 'ai' else False}
                             for m in values.get('messages', [])],
                'question': values.get('question', ''), 'draft': values.get('draft', ''),
                'category': values.get('category', ''),
                'answer': values.get('answer', ''), 'decision': values.get('decision', ''),
                'sources': values.get('sources', [])}

    def get_thread(self, thread_id: UUID):
        with self.lock:
            return self.snapshot(thread_id)

    def ask(self, thread_id: UUID, body: Question):
        self.require_chat_model()
        with self.lock:
            state = self.app.state.graph.get_state(config(thread_id))
            if state.next == ('review',):
                self.snapshot(thread_id)
                state = self.app.state.graph.get_state(config(thread_id))
            if state.next:
                raise HTTPException(409, 'Reply to the clarification before asking another question; start a new conversation after a failed request.')
            with graph_operation(thread_id):
                self.app.state.graph.invoke({'question': body.question, 'category': body.category,
                                        'review_action': '', 'review_answer': ''}, config(thread_id))
            return self.snapshot(thread_id)

    def clarify(self, thread_id: UUID, body: ClarificationReply):
        self.require_chat_model()
        with self.lock:
            current = self.snapshot(thread_id)
            if not current['pending_clarification']:
                raise HTTPException(409, 'No clarification reply is expected')
            with graph_operation(thread_id):
                self.app.state.graph.update_state(config(thread_id), {'clarification_reply': body.answer})
                self.app.state.graph.invoke(None, config(thread_id))
            return self.snapshot(thread_id)

    def review(self, thread_id: UUID, body: Review):
        with self.lock:
            current = self.snapshot(thread_id)
            if not current['pending_review']:
                raise HTTPException(409, 'No answer is waiting for review')
            with graph_operation(thread_id):
                self.app.state.graph.update_state(config(thread_id),
                                             {'review_action': body.action, 'review_answer': body.answer})
                self.app.state.graph.invoke(None, config(thread_id))
            return self.snapshot(thread_id)
