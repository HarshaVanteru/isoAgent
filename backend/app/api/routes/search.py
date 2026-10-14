from typing import Annotated
from fastapi import APIRouter, Depends
from ..dependencies import get_services
from ...models.requests import SearchRequest
from ...models.responses import SearchResponse

router = APIRouter(tags=['search'])


@router.post('/search', response_model=SearchResponse)
def search(body: SearchRequest, services: Annotated[object, Depends(get_services)]):
    return services.search.search(body.query, body.top_k, body.filters)
