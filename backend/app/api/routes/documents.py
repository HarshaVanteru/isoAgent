from typing import Annotated
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from ..dependencies import get_services
from ...models.requests import FolderRequest
from ...models.responses import IngestResponse, DocumentResponse
from ...utils.file_utils import document_folder

router = APIRouter(tags=['documents'])
Services = Annotated[object, Depends(get_services)]


@router.post('/documents/ingest', response_model=IngestResponse)
def ingest(services: Services, file: UploadFile = File(...), force: bool = Query(False)):
    try:
        return services.ingestion.upload(file.file, file.filename or '', force)
    finally:
        file.file.close()


@router.post('/documents/ingest-folder')
def ingest_folder(body: FolderRequest, services: Services):
    folder = document_folder(services.settings.document_dir, body.path)
    return services.ingestion.ingest_folder(folder, body.force)


@router.get('/documents/{document_id}', response_model=DocumentResponse)
def get_document(document_id: str, services: Services):
    result = services.store.document(document_id)
    if result is None:
        raise HTTPException(404, 'Document not found')
    return result


@router.delete('/documents/{document_id}')
def delete_document(document_id: str, services: Services):
    if not services.ingestion.delete_document(document_id):
        raise HTTPException(404, 'Document not found')
    return {'document_id': document_id, 'status': 'deleted'}
