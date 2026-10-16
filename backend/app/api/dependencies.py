"""Typed FastAPI dependencies for services created in the application lifespan."""
from typing import Annotated

from fastapi import Depends, Request

from ..core.errors import IndexConfigurationError
from ..services.container import Services
from ..services.conversation_service import ConversationService


def get_services(request: Request) -> Services:
    services = getattr(request.app.state, 'services', None)
    if services is None:
        raise IndexConfigurationError('Application services are not initialized')
    return services


def get_conversations(request: Request) -> ConversationService:
    conversations = getattr(request.app.state, 'conversations', None)
    if conversations is None:
        raise IndexConfigurationError('Conversation service is not initialized')
    return conversations


ServicesDep = Annotated[Services, Depends(get_services)]
ConversationsDep = Annotated[ConversationService, Depends(get_conversations)]
