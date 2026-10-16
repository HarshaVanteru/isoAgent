"""Chat HTTP endpoints; conversation behavior lives in ConversationService."""
from uuid import UUID, uuid4
from fastapi import APIRouter
from ..dependencies import ConversationsDep
from ...models.requests import Question, ClarificationReply, Review

router = APIRouter(prefix='/api/threads', tags=['chat'])


@router.post('')
def create_thread():
    return {'thread_id': str(uuid4())}


@router.get('/{thread_id}')
def get_thread(thread_id: UUID, conversations: ConversationsDep):
    return conversations.get_thread(thread_id)


@router.post('/{thread_id}/messages')
def ask(thread_id: UUID, body: Question, conversations: ConversationsDep):
    return conversations.ask(thread_id, body)


@router.post('/{thread_id}/clarify')
def clarify(thread_id: UUID, body: ClarificationReply, conversations: ConversationsDep):
    return conversations.clarify(thread_id, body)


@router.post('/{thread_id}/review')
def review(thread_id: UUID, body: Review, conversations: ConversationsDep):
    return conversations.review(thread_id, body)


# SSE is carried over POST so a question and its progress share one request.
def progress_response(action):
    import json
    from queue import Queue, Empty
    from threading import Thread
    from fastapi.responses import StreamingResponse
    from ...core.errors import PipelineError
    from fastapi import HTTPException

    events = Queue()

    def work():
        try:
            events.put(('result', action(lambda stage: events.put(('progress', {'stage': stage})))))
        except (HTTPException, PipelineError) as exc:
            events.put(('error', {'detail': getattr(exc, 'detail', str(exc))}))
        except Exception:
            import logging
            logging.exception('Progress request failed')
            events.put(('error', {'detail': 'Conversation processing failed. Please try a new conversation.'}))

    def stream():
        Thread(target=work, daemon=True).start()
        yield ': connected\n\n'
        while True:
            try:
                event, data = events.get(timeout=10)
            except Empty:
                yield ': keepalive\n\n'
                continue
            yield f'event: {event}\ndata: {json.dumps(data)}\n\n'
            if event in ('result', 'error'):
                break

    return StreamingResponse(stream(), media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@router.post('/{thread_id}/messages/stream')
def ask_stream(thread_id: UUID, body: Question, conversations: ConversationsDep):
    conversations.require_chat_model()
    return progress_response(lambda notify: conversations.ask(thread_id, body, on_progress=notify))


@router.post('/{thread_id}/clarify/stream')
def clarify_stream(thread_id: UUID, body: ClarificationReply, conversations: ConversationsDep):
    conversations.require_chat_model()
    return progress_response(lambda notify: conversations.clarify(thread_id, body, on_progress=notify))


@router.delete('/{thread_id}')
def delete_thread(thread_id: UUID, conversations: ConversationsDep):
    return conversations.delete_thread(thread_id)
