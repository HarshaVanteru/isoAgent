from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from ..dependencies import ServicesDep
from ...models.requests import FolderRequest
from ...models.responses import IngestResponse, DocumentResponse
from ...utils.file_utils import document_folder

router = APIRouter(tags=['documents'])


@router.post('/documents/ingest', response_model=IngestResponse)
def ingest(services: ServicesDep, file: UploadFile = File(...), force: bool = Query(False)):
    try:
        return services.ingestion.upload(file.file, file.filename or '', force)
    finally:
        file.file.close()


@router.post('/documents/ingest-folder')
def ingest_folder(body: FolderRequest, services: ServicesDep):
    folder = document_folder(services.settings.document_dir, body.path)
    return services.ingestion.ingest_folder(folder, body.force)


@router.get('/documents/{document_id}', response_model=DocumentResponse)
def get_document(document_id: str, services: ServicesDep):
    result = services.store.document(document_id)
    if result is None:
        raise HTTPException(404, 'Document not found')
    return result


@router.delete('/documents/{document_id}')
def delete_document(document_id: str, services: ServicesDep):
    if not services.ingestion.delete_document(document_id):
        raise HTTPException(404, 'Document not found')
    return {'document_id': document_id, 'status': 'deleted'}
