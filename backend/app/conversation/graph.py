"""LangGraph topology; decisions and retrieval remain in dedicated services."""
from langgraph.graph import END, START, StateGraph
from ..core.config import Settings
from .state import ChatState
from .nodes import ConversationNodes


def build_graph(index, llm, checkpointer, settings=None):
    options = settings or Settings(_env_file=None)
    nodes = ConversationNodes(index, llm, options)
    builder = StateGraph(ChatState)
    names = ('conversation_router', 'direct_response', 'query_analysis', 'clarification',
             'await_clarification', 'query_expansion', 'multi_query_generation', 'retrieval',
             'reranking', 'retrieval_quality_check', 'reformulate_query', 'generate_draft',
             'insufficient_evidence', 'finalize_answer', 'review')
    for name in names:
        builder.add_node(name, getattr(nodes, name))
    builder.add_edge(START, 'conversation_router')
    builder.add_conditional_edges('conversation_router', lambda s: s['route'],
                                  {'conversation': 'direct_response', 'document': 'query_analysis'})
    builder.add_edge('direct_response', END)

    def analysis_route(state):
        if state['query_clear']:
            return 'query_expansion'
        if state.get('clarification_count', 0) < options.clarification_max_rounds:
            return 'clarification'
        return 'insufficient_evidence'

    builder.add_conditional_edges('query_analysis', analysis_route,
        {name: name for name in ('query_expansion', 'clarification', 'insufficient_evidence')})
    builder.add_edge('clarification', 'await_clarification')
    builder.add_edge('await_clarification', 'query_analysis')
    builder.add_edge('query_expansion', 'multi_query_generation')
    builder.add_edge('multi_query_generation', 'retrieval')
    builder.add_edge('retrieval', 'reranking')
    builder.add_edge('reranking', 'retrieval_quality_check')

    def quality_route(state):
        if state['evidence_sufficient']:
            return 'generate_draft'
        if state.get('retry_count', 0) < options.retrieval_max_retries:
            return 'reformulate_query'
        return 'insufficient_evidence'

    builder.add_conditional_edges('retrieval_quality_check', quality_route,
        {name: name for name in ('generate_draft', 'reformulate_query', 'insufficient_evidence')})
    builder.add_edge('reformulate_query', 'retrieval')
    builder.add_edge('generate_draft', 'finalize_answer')
    builder.add_edge('insufficient_evidence', 'finalize_answer')
    builder.add_edge('finalize_answer', END)
    builder.add_edge('review', END)
    # Retain the review node name only to resume older persisted checkpoints.
    return builder.compile(checkpointer=checkpointer,
                           interrupt_before=['await_clarification'])
