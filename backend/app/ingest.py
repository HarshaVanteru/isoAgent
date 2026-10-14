"""Build the document index independently of the query server."""
import json
import argparse
import logging

from .core.config import settings
from .services.document_index import DocumentIndex
from .utils.file_utils import document_folder
from .core.errors import PipelineError
from .core.logging import configure_logging


def main():
    configure_logging()
    parser = argparse.ArgumentParser(description='Ingest ISO documents into the configured local index')
    parser.add_argument('--folder', help='Folder inside DOCUMENT_DIR (Qdrant backend)')
    parser.add_argument('--force', action='store_true', help='Rebuild even unchanged documents')
    args = parser.parse_args()
    index = DocumentIndex(settings)
    try:
        folder = document_folder(settings.document_dir, args.folder)
        report = index.services.ingestion.ingest_folder(folder, args.force)
    except KeyboardInterrupt:
        logging.error('Ingestion cancelled; successfully indexed documents were kept.')
        return 130
    except PipelineError as exc:
        logging.error('Ingestion stopped: %s', exc)
        return 1
    except Exception:
        logging.exception('Ingestion stopped unexpectedly; successfully indexed documents were kept.')
        return 1
    finally:
        index.services.close()
    print(json.dumps(report, indent=2))
    return 1 if any(file['status'] == 'error' for file in report['files']) else 0


if __name__ == '__main__':
    raise SystemExit(main())
