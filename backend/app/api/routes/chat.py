"""Chat HTTP endpoints; conversation behavior lives in ConversationService."""
from uuid import UUID, uuid4
from fastapi import APIRouter, Request
from ...models.requests import Question, ClarificationReply, Review

router = APIRouter(prefix='/api/threads', tags=['chat'])


@router.post('')
def create_thread():
    return {'thread_id': str(uuid4())}


@router.get('/{thread_id}')
def get_thread(thread_id: UUID, request: Request):
    return request.app.state.conversations.get_thread(thread_id)


@router.post('/{thread_id}/messages')
def ask(thread_id: UUID, body: Question, request: Request):
    return request.app.state.conversations.ask(thread_id, body)


@router.post('/{thread_id}/clarify')
def clarify(thread_id: UUID, body: ClarificationReply, request: Request):
    return request.app.state.conversations.clarify(thread_id, body)


@router.post('/{thread_id}/review')
def review(thread_id: UUID, body: Review, request: Request):
    return request.app.state.conversations.review(thread_id, body)
