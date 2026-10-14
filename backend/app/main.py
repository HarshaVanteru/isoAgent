"""FastAPI application assembly and resource lifecycle."""
import sqlite3
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langchain_groq import ChatGroq
from langgraph.checkpoint.sqlite import SqliteSaver

from .core.config import settings
from .conversation.graph import build_graph
from .services.document_index import DocumentIndex
from .api.routes import documents as document_routes, search as search_routes, chat as chat_routes
from .core.errors import PipelineError
from .core.logging import configure_logging
from .services.conversation_service import ConversationService

index = DocumentIndex(settings)


@asynccontextmanager
async def lifespan(app):
    configure_logging()
    app.state.services = index.services
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    # Keep modern and legacy checkpoint formats separate.
    connection = sqlite3.connect(settings.data_dir / 'conversations-legacy.sqlite', check_same_thread=False)
    saver = SqliteSaver(connection)
    llm = ChatGroq(model=settings.groq_model, api_key=settings.groq_api_key or 'not-configured',
                   temperature=0, max_tokens=2048, timeout=60, max_retries=2)
    app.state.graph = build_graph(index, llm, saver, settings=settings)
    app.state.conversations = ConversationService(app, settings)
    try:
        yield
    finally:
        connection.close()
        if app.state.services is not None:
            app.state.services.close()


app = FastAPI(title='ISO Knowledge Assistant', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173'],
                   allow_methods=['GET', 'POST', 'DELETE'], allow_headers=['Content-Type'])
app.include_router(chat_routes.router)
app.include_router(document_routes.router)
app.include_router(search_routes.router)
app.include_router(document_routes.router, prefix='/api')
app.include_router(search_routes.router, prefix='/api')


@app.exception_handler(PipelineError)
async def pipeline_error(request, exc):
    return JSONResponse(status_code=exc.status_code, content={'detail': str(exc)})


@app.get('/api/health')
@app.get('/health')
def health():
    return {'status': 'ok', 'groq_configured': bool(settings.groq_api_key),
            'model': settings.groq_model, 'embedding_model': settings.embedding_model,
            'index_backend': 'qdrant', 'reranker_model': settings.reranker_model}


@app.get('/api/documents')
def documents():
    report = index.report()
    return {**report, 'inventory': index.inventory()}
