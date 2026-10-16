"""Configure native LangGraph tracing; never install duplicate callbacks or wrappers."""
import logging
import os


def configure_tracing(settings):
    enabled = settings.langsmith_tracing and bool(settings.langsmith_api_key)
    os.environ['LANGSMITH_TRACING'] = 'true' if enabled else 'false'
    # Prevent the legacy flag from enabling tracing when this configuration disables it.
    os.environ['LANGCHAIN_TRACING_V2'] = 'true' if enabled else 'false'
    if not enabled:
        if settings.langsmith_tracing:
            logging.getLogger(__name__).warning('LangSmith tracing disabled: LANGSMITH_API_KEY is empty')
        return
    os.environ['LANGSMITH_API_KEY'] = settings.langsmith_api_key
    os.environ['LANGSMITH_PROJECT'] = settings.langsmith_project
    os.environ['LANGSMITH_ENDPOINT'] = settings.langsmith_endpoint
    if settings.langsmith_workspace_id:
        os.environ['LANGSMITH_WORKSPACE_ID'] = settings.langsmith_workspace_id
    logging.getLogger(__name__).info('Native LangGraph tracing enabled for project %s', settings.langsmith_project)
