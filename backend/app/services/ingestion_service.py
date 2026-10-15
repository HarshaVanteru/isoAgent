import json
import logging
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock
from ..core.errors import InvalidFile, PipelineError, StorageError, ModelError, IndexConfigurationError
from ..ingestion.metadata import document_type, enrich, source_metadata
from ..models.responses import IngestResponse
from ..utils.file_utils import SUPPORTED, content_hash, document_inventory, validate_file, within_root


log = logging.getLogger(__name__)


class IngestionService:
    def __init__(self, settings, converter, parser, chunker, embeddings, store):
        self.settings, self.converter, self.parser = settings, converter, parser
        self.chunker, self.embeddings, self.store = chunker, embeddings, store
        self.lock = RLock()
        self.report_path = settings.data_dir / 'qdrant-ingestion.json'

    def report(self):
        with self.lock:
            if self.report_path.exists():
                return json.loads(self.report_path.read_text(encoding='utf-8'))
            return {'files': [], 'chunks': 0, 'indexed_at': None}

    def save_report(self, report):
        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='.tmp',
                                             dir=self.report_path.parent, delete=False) as stream:
                temporary = Path(stream.name)
                json.dump(report, stream, indent=2)
            temporary.replace(self.report_path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)

    def inventory(self):
        return document_inventory(self.settings.document_dir)

    def ingest_file(self, path, force=False, source=None):
        with self.lock:
            path = Path(path)
            validate_file(path)
            source = source or (path.relative_to(self.settings.document_dir).as_posix()
                if path.is_relative_to(self.settings.document_dir) else path.name)
            document_id = content_hash(path)
            log.info('Document received: %s (%s)', path.name, document_id)
            self.store.ensure_collection(self.embeddings.dimension)
            report = self.report()
            old = next((entry for entry in report['files'] if entry['source'] == source), None)
            duplicate = self.store.document(document_id)
            if duplicate and duplicate['chunks'] == duplicate['metadata'].get('document_chunk_count') and not force:
                count = duplicate['chunks']
                status = 'duplicate'
            else:
                converted = self.converter.convert(path)
                document = self.parser.parse(converted)
                chunks = self.chunker.chunk(document, path.suffix.lower(), document_type(path))
                if not chunks and converted.suffix.lower() == '.pdf':
                    log.warning('Docling produced no chunks for %s; trying the PDF text layer', path.name)
                    document = self.parser.pdf_text_fallback(converted)
                    chunks = self.chunker.chunk(document, '.pdf', document_type(path))
                    for chunk in chunks:
                        chunk.metadata.update(extractor='pypdf_text_fallback',
                            extraction_warning='Text layer only; diagram relationships and layout are not reconstructed')
                if not chunks:
                    raise InvalidFile('No extractable content was found in the document')
                timestamp = datetime.now(timezone.utc).isoformat()
                enrich(chunks, path, document_id, source, timestamp)
                for chunk in chunks:
                    chunk.metadata['document_chunk_count'] = len(chunks)
                processed = self.settings.data_dir / 'processed' / document_id
                processed.mkdir(parents=True, exist_ok=True)
                document.save_as_json(processed / 'document.json')
                (processed / 'chunks.json').write_text(
                    json.dumps([chunk.model_dump() for chunk in chunks], indent=2), encoding='utf-8')
                # Finish all model work before replacing an existing document.
                vectors = self.embeddings.embed_documents([chunk.text for chunk in chunks])
                self.store.delete_document(document_id)
                try:
                    self.store.insert(chunks, vectors)
                except BaseException:
                    # Never expose a partially written failed document. Other
                    # successfully indexed documents remain untouched.
                    try:
                        self.store.delete_document(document_id)
                    except Exception as cleanup_error:
                        raise StorageError('Document insertion failed and partial-vector cleanup failed; check server logs') from cleanup_error
                    raise
                count, status = len(chunks), 'indexed'
            entry = {'source': source, 'document_id': document_id, 'sha256': document_id,
                     'document_name': path.name, 'file_type': path.suffix.lower(),
                     'folder_managed': path.resolve().is_relative_to(self.settings.document_dir),
                     'status': 'indexed', 'chunks': count}
            report['files'] = [e for e in report['files'] if e['source'] != source] + [entry]
            if old and old.get('document_id') != document_id:
                self.remove_unreferenced(old.get('document_id'), report['files'])
            report.update(chunks=self.store.count(), indexed_at=datetime.now(timezone.utc).isoformat(),
                          embedding_model=self.settings.embedding_model)
            self.save_report(report)
            return IngestResponse(document_id=document_id, document_name=path.name, status=status, chunks=count)

    def remove_unreferenced(self, document_id, files):
        if not document_id:
            return
        references = [e for e in files if e.get('document_id') == document_id and e.get('status') == 'indexed']
        if not references:
            self.store.delete_document(document_id)
        else:
            self.store.update_metadata(document_id,
                source_metadata(references[0]['source'], references[0]['document_name']))

    def ingest_folder(self, folder=None, force=False):
        with self.lock:
            root = self.settings.document_dir
            folder = within_root(Path(folder) if folder else root, root)
            if not folder.is_dir():
                raise InvalidFile('Document folder does not exist')
            # Validate model/config/connection before reconciling any prior files.
            self.store.ensure_collection(self.embeddings.dimension)
            paths = [p for p in sorted(folder.rglob('*')) if p.is_file() and p.resolve().is_relative_to(root)]
            current = {p.relative_to(root).as_posix() for p in paths}
            report = self.report()
            retained = []
            for entry in report['files']:
                source = entry['source']
                in_scope = entry.get('folder_managed', True) and (root / source).resolve().is_relative_to(folder)
                if in_scope and source not in current:
                    continue
                retained.append(entry)
            for entry in report['files']:
                if entry not in retained:
                    self.remove_unreferenced(entry.get('document_id'), retained)
            report['files'] = retained
            self.save_report(report)
            for path in paths:
                source = path.relative_to(root).as_posix()
                log.info('Ingesting: %s', source)
                try:
                    self.ingest_file(path, force, source)
                except (StorageError, ModelError, IndexConfigurationError):
                    # Continuing cannot repair infrastructure/model failures.
                    # Keep everything successfully indexed before this failure.
                    raise
                except Exception as exc:
                    log.error('Skipping failed document %s: %s', source, exc)
                    report = self.report()
                    old = next((entry for entry in report['files'] if entry['source'] == source), None)
                    report['files'] = [entry for entry in report['files'] if entry['source'] != source]
                    if old:
                        self.remove_unreferenced(old.get('document_id'), report['files'])
                    report['files'].append({'source': source, 'document_name': path.name,
                        'file_type': path.suffix.lower(), 'folder_managed': True,
                        'status': 'error', 'chunks': 0,
                        'error': str(exc) if isinstance(exc, PipelineError) else 'Ingestion failed; check server logs'})
                    report.update(chunks=self.store.count(), indexed_at=datetime.now(timezone.utc).isoformat())
                    self.save_report(report)
            report = self.report()
            report.update(chunks=self.store.count(), indexed_at=datetime.now(timezone.utc).isoformat())
            self.save_report(report)
            return report

    def delete_document(self, document_id):
        with self.lock:
            if not self.store.document(document_id):
                return False
            self.store.delete_document(document_id)
            report = self.report()
            report['files'] = [e for e in report['files'] if e.get('document_id') != document_id]
            report['chunks'] = self.store.count()
            self.save_report(report)
            return True

    def upload(self, stream, filename, force=False):
        with self.lock:
            safe_name = Path(filename.replace('\\', '/')).name
            if not safe_name or Path(safe_name).suffix.lower() not in SUPPORTED:
                raise InvalidFile('Unsupported upload filename or file type')
            raw = self.settings.data_dir / 'raw'
            raw.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(dir=raw) as work:
                temporary = Path(work) / safe_name
                size = 0
                with temporary.open('wb') as output:
                    while block := stream.read(1024 * 1024):
                        size += len(block)
                        if size > self.settings.upload_max_bytes:
                            raise InvalidFile('Upload exceeds UPLOAD_MAX_BYTES')
                        output.write(block)
                validate_file(temporary)
                target = raw / content_hash(temporary) / safe_name
                target.parent.mkdir(parents=True, exist_ok=True)
                if not target.exists():
                    temporary.replace(target)
                return self.ingest_file(target, force, source=f'uploads/{safe_name}')
