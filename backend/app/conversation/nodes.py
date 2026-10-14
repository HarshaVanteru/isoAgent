import logging
import re
import json
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from ..core.errors import PipelineError
from . import prompts
from .context import current_turn, passages, request_context, unique_queries
from .models import ConversationRoute, QueryAnalysis, QueryVariants, RetrievalQuality

log = logging.getLogger(__name__)


def normalize_citations(text):
    """Expand numeric citation lists/ranges without changing source numbers."""
    def expand(match):
        numbers = []
        for part in re.split(r'\s*[,;]\s*', match.group(1)):
            bounds = re.split(r'\s*[-–]\s*', part)
            start = int(bounds[0])
            end = int(bounds[-1])
            if end < start or end - start > 100:
                return match.group(0)
            numbers.extend(range(start, end + 1))
        return ''.join(f'[{number}]' for number in numbers)
    return re.sub(r'\[\s*(\d+(?:\s*[-–]\s*\d+)?(?:\s*[,;]\s*\d+(?:\s*[-–]\s*\d+)?)*)\s*\]', expand, text)


class CorpusUnavailable(PipelineError):
    status_code = 409


class ConversationNodes:
    def __init__(self, index, llm, settings):
        self.index, self.llm, self.settings = index, llm, settings
        method = settings.graph_structured_output_method
        self.method = method
        kwargs = {'strict': True} if method == 'json_schema' else {}
        self.structured = {schema: llm.with_structured_output(schema, method=method, **kwargs)
                           for schema in (ConversationRoute, QueryAnalysis, QueryVariants, RetrievalQuality)}

    def decide(self, schema, prompt, state, content, include_history=True):
        if self.method == 'json_mode':
            prompt += prompts.JSON_SCHEMA_INSTRUCTION + json.dumps(schema.model_json_schema())
        response = self.structured[schema].invoke([
            SystemMessage(content=prompt + prompts.UNTRUSTED_CONTEXT),
            *(state.get('messages', [])[-12:] if include_history else []), HumanMessage(content=content)])
        return response if isinstance(response, schema) else schema.model_validate(response)

    @staticmethod
    def trace(state, name):
        log.info('Conversation stage: %s', name)
        return {'steps': [*state.get('steps', []), name]}

    def conversation_router(self, state):
        decision = self.decide(ConversationRoute,
            prompts.CONVERSATION_ROUTER,
            state, state['question'])
        return {'route': decision.route, 'query': '', 'query_clear': False,
                'expanded_queries': [], 'queries': [], 'attempted_queries': [],
                'candidates': [], 'sources': [], 'draft': '', 'answer': '', 'decision': '',
                'clarification_question': '', 'clarification_reply': '',
                'clarification_history': [], 'clarification_count': 0,
                'retry_count': 0, 'retrieval_attempts': 0,
                'evidence_sufficient': False, 'quality_reason': '', 'supporting_citations': [],
                'review_action': '', 'review_answer': '', 'steps': ['conversation_router']}

    def direct_response(self, state):
        response = self.llm.invoke([SystemMessage(content=
            prompts.DIRECT_RESPONSE),
            *state.get('messages', [])[-12:], HumanMessage(content=state['question'])])
        text = str(response.content).strip()
        if not text:
            raise ValueError('Empty conversational response')
        return {**self.trace(state, 'direct_response'), 'answer': text, 'decision': 'direct',
                'messages': [*current_turn(state), AIMessage(content=text, additional_kwargs={'reviewed': False})]}

    def query_analysis(self, state):
        result = self.decide(QueryAnalysis,
            prompts.QUERY_ANALYSIS,
            state, request_context(state))
        query = result.standalone_query.strip()[:4000] or state['question']
        return {**self.trace(state, 'query_analysis'), 'query': query, 'query_clear': result.clear,
                'clarification_question': result.clarification_question.strip()[:1000] if not result.clear else ''}

    def clarification(self, state):
        return {**self.trace(state, 'clarification'),
                'clarification_count': state.get('clarification_count', 0) + 1,
                'clarification_question': state.get('clarification_question') or
                    'Which procedure, form, or topic would you like me to search for?'}

    def await_clarification(self, state):
        reply = state.get('clarification_reply', '').strip()
        if not reply:
            raise ValueError('A clarification reply is required')
        return {**self.trace(state, 'await_clarification'), 'clarification_reply': '',
                'clarification_history': [*state.get('clarification_history', []),
                    {'question': state['clarification_question'], 'answer': reply}]}

    def query_expansion(self, state):
        result = self.decide(QueryVariants,
            prompts.QUERY_EXPANSION.format(variant_limit=self.settings.multi_query_limit - 1),
            state, state['query']) if self.settings.multi_query_limit > 1 else QueryVariants(queries=[])
        return {**self.trace(state, 'query_expansion'), 'expanded_queries': result.queries[:5]}

    def multi_query_generation(self, state):
        return {**self.trace(state, 'multi_query_generation'),
                'queries': unique_queries(state['query'], state.get('expanded_queries', []), self.settings.multi_query_limit)}

    def retrieval(self, state):
        if hasattr(self.index, 'report') and not self.index.report().get('chunks'):
            raise CorpusUnavailable('Run python -m backend.app.ingest before querying documents.')
        category = state.get('category', '')
        candidates = self.index.retrieve_candidates(state['queries'], category)
        return {**self.trace(state, 'retrieval'), 'candidates': candidates,
                'retrieval_attempts': state.get('retrieval_attempts', 0) + 1,
                'attempted_queries': unique_queries('', [*state.get('attempted_queries', []), *state['queries']], 50)}

    def reranking(self, state):
        sources = self.index.rerank_candidates(state['query'], state['candidates'])
        sources = [{**hit, 'citation': i + 1} for i, hit in enumerate(sources)]
        return {**self.trace(state, 'reranking'), 'sources': sources}

    def retrieval_quality_check(self, state):
        if not state['sources']:
            result = RetrievalQuality(sufficient=False, supporting_citations=[], reason='No relevant passages were retrieved.')
        else:
            result = self.decide(RetrievalQuality,
                prompts.RETRIEVAL_QUALITY,
                state, 'REQUEST:\n' + request_context(state) + '\nSTANDALONE QUERY:\n' + state['query'] +
                '\nRETRIEVED DATA:\n' + passages(state['sources']), include_history=False)
        valid = sorted(set(result.supporting_citations) & {hit['citation'] for hit in state['sources']})
        return {**self.trace(state, 'retrieval_quality_check'),
                'evidence_sufficient': result.sufficient and bool(valid),
                'supporting_citations': valid, 'quality_reason': result.reason[:1000]}

    def reformulate_query(self, state):
        result = self.decide(QueryVariants,
            prompts.QUERY_REFORMULATION,
            state, 'REQUEST:\n' + request_context(state) + '\nQUERY:\n' + state['query'] +
            '\nPREVIOUS QUERIES:\n' + '\n'.join(state.get('attempted_queries', [])) +
            '\nEVIDENCE GAP:\n' + state.get('quality_reason', ''))
        return {**self.trace(state, 'reformulate_query'), 'retry_count': state.get('retry_count', 0) + 1,
                'queries': unique_queries(state['query'], result.queries[:5], self.settings.multi_query_limit)}

    def generate_draft(self, state):
        # Keep citation numbering stable from grading through answer generation.
        sources = [hit for hit in state['sources'] if hit['citation'] in state['supporting_citations']]
        messages = [SystemMessage(content=
            prompts.ANSWER_GENERATION.format(allowed_citations=', '.join(f'[{hit["citation"]}]' for hit in sources), passages=passages(sources))),
            *state.get('messages', [])[-12:], *current_turn(state)]
        response = self.llm.invoke(messages)
        text = normalize_citations(str(response.content).strip())
        if not text:
            raise ValueError('Empty answer draft')
        cited = {int(number) for number in re.findall(r'\[(\d+)\]', text)}
        allowed = {source['citation'] for source in sources}
        if not cited or not cited.issubset(allowed):
            log.warning('Draft citation validation failed: cited=%s allowed=%s finish_reason=%s; retrying',
                        sorted(cited), sorted(allowed), response.response_metadata.get('finish_reason'))
            response = self.llm.invoke([*messages, AIMessage(content=text), HumanMessage(content=
                prompts.CITATION_REPAIR.format(allowed_citations=', '.join(f'[{number}]' for number in sorted(allowed))))])
            text = normalize_citations(str(response.content).strip())
            cited = {int(number) for number in re.findall(r'\[(\d+)\]', text)}
        if not cited or not cited.issubset(allowed):
            log.warning('Corrected draft citation validation failed: cited=%s allowed=%s finish_reason=%s',
                        sorted(cited), sorted(allowed), response.response_metadata.get('finish_reason'))
            return {**self.trace(state, 'generate_draft'), 'sources': sources,
                    'evidence_sufficient': False, 'quality_reason': 'The generated draft had missing or invalid citations.',
                    'draft': 'I retrieved supporting passages, but could not produce an answer with valid source citations. Please review the evidence or try rephrasing the question.'}
        return {**self.trace(state, 'generate_draft'), 'sources': sources, 'draft': text}

    def insufficient_evidence(self, state):
        if not state.get('query_clear'):
            text = 'I still need a more specific document question to search reliably. Please start a new question naming the topic, procedure, or form.'
        elif not state.get('sources'):
            text = 'I could not find supporting passages in the indexed documents. Please broaden the category, name the relevant document, or rephrase your question.'
        else:
            text = 'I found related passages, but they do not provide enough evidence for a reliable answer. Please narrow the question or identify the relevant document.'
        return {**self.trace(state, 'insufficient_evidence'), 'draft': text}

    def review(self, state):
        # Compatibility for drafts saved before automatic answers were enabled.
        return self.finalize_answer(state)

    def finalize_answer(self, state):
        answer = state['draft']
        return {**self.trace(state, 'finalize_answer'), 'answer': answer, 'decision': 'automatic',
                'messages': [*current_turn(state), AIMessage(content=answer, additional_kwargs={'reviewed': False})]}
