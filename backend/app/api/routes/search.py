from fastapi import APIRouter
from ..dependencies import ServicesDep
from ...models.requests import SearchRequest
from ...models.responses import SearchResponse

router = APIRouter(tags=['search'])


@router.post('/search', response_model=SearchResponse)
def search(body: SearchRequest, services: ServicesDep):
    return services.search.search(body.query, body.top_k, body.filters)
