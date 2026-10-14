import logging
from threading import RLock
from ..core.errors import ParsingError

log = logging.getLogger(__name__)


class DoclingParser:
    def __init__(self):
        self._converter = None
        self._lock = RLock()

    def parse(self, path):
        log.info('Parsing started: %s', path.name)
        try:
            with self._lock:
                from docling.document_converter import DocumentConverter
                from docling.datamodel.base_models import ConversionStatus
                from docling_core.types.doc import DoclingDocument, DocItemLabel
                if path.suffix.lower() in {'.txt', '.csv'}:
                    doc = DoclingDocument(name=path.stem)
                    doc.add_text(label=DocItemLabel.TEXT, text=path.read_text(encoding='utf-8-sig'))
                    return doc
                if self._converter is None:
                    self._converter = DocumentConverter()
                result = self._converter.convert(path)
                if result.status != ConversionStatus.SUCCESS:
                    raise ParsingError('Document parsing was incomplete; document was not indexed')
                return result.document
        except ParsingError:
            raise
        except Exception as exc:
            log.exception('Parsing failed: %s', path.name)
            raise ParsingError('Document parsing failed; check server logs') from exc

    def pdf_text_fallback(self, path):
        """Recover an existing PDF text layer when layout extraction is empty."""
        try:
            from pypdf import PdfReader
            from docling_core.types.doc import DoclingDocument, DocItemLabel, ProvenanceItem
            from docling_core.types.doc.base import BoundingBox, CoordOrigin, Size
            document = DoclingDocument(name=path.stem)
            reader = PdfReader(path)
            for number, page in enumerate(reader.pages, 1):
                width, height = float(page.mediabox.width), float(page.mediabox.height)
                document.add_page(page_no=number, size=Size(width=width, height=height))
                text = (page.extract_text() or '').strip()
                if not text:
                    continue
                document.add_heading(text=f'Page {number}', level=1)
                document.add_text(label=DocItemLabel.TEXT, text=text, prov=ProvenanceItem(
                    page_no=number, charspan=(0, len(text)), bbox=BoundingBox(
                        l=0, t=0, r=width, b=height, coord_origin=CoordOrigin.TOPLEFT)))
            return document
        except Exception as exc:
            log.exception('PDF text fallback failed: %s', path.name)
            raise ParsingError('PDF text fallback failed; check server logs') from exc
