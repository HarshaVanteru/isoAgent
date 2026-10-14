import json
from langchain_core.messages import AIMessage, HumanMessage


def current_turn(state):
    messages = [HumanMessage(content=state['question'])]
    for item in state.get('clarification_history', []):
        messages.extend([AIMessage(content=item['question'], additional_kwargs={'reviewed': False}),
                         HumanMessage(content=item['answer'])])
    return messages


def request_context(state):
    return json.dumps({'question': state['question'],
                       'clarifications': state.get('clarification_history', [])}, ensure_ascii=False)


def unique_queries(query, variants, limit):
    result, seen = [], set()
    for text in [query, *variants]:
        text = text.strip()[:4000]
        if text and text.casefold() not in seen:
            result.append(text)
            seen.add(text.casefold())
        if len(result) == limit:
            break
    return result


def passages(sources):
    records = []
    for source in sources:
        meta = source.get('metadata', {})
        records.append({'citation': source['citation'], 'source': meta.get('source', ''),
            'location': {k: meta[k] for k in ('page', 'slide', 'sheet', 'section') if meta.get(k) is not None},
            'text': source['text']})
    # JSON separates retrieved data from system instructions, including chunks
    # that themselves contain instruction-like text or fake delimiters.
    return json.dumps(records, ensure_ascii=False)
