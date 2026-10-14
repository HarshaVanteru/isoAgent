import logging
from collections import defaultdict
from ..core.errors import ParsingError
from ..models.responses import Chunk

log = logging.getLogger(__name__)


class StructuredChunker:
    """HybridChunker by default; bounded form/slide and table-row strategies."""
    def __init__(self, settings, embeddings):
        self.settings, self.embeddings = settings, embeddings
        self._hybrid = None

    @property
    def hybrid(self):
        if self._hybrid is None:
            from docling.chunking import HybridChunker
            from docling_core.transforms.chunker.tokenizer.huggingface import HuggingFaceTokenizer
            self._hybrid = HybridChunker(tokenizer=HuggingFaceTokenizer(
                tokenizer=self.embeddings.model.tokenizer,
                max_tokens=self.settings.chunk_max_tokens), merge_peers=True)
        return self._hybrid

    def tokens(self, text):
        return len(self.embeddings.model.tokenizer.encode(text, add_special_tokens=False))

    def bounded(self, text, metadata):
        """Token-safe fallback for a single oversized row or compatibility text."""
        tokenizer = self.embeddings.model.tokenizer
        ids = tokenizer.encode(text, add_special_tokens=False)
        size = self.settings.chunk_max_tokens
        return [Chunk(text=tokenizer.decode(ids[i:i + size], skip_special_tokens=True), metadata=metadata)
                for i in range(0, len(ids), size)]

    @staticmethod
    def provenance(items):
        pages = sorted({p.page_no for item in items for p in getattr(item, 'prov', [])})
        return {'page_number': pages[0] if pages else None, 'pages': pages}

    def chunk(self, document, file_type, document_type):
        try:
            if file_type in {'.xlsx', '.xls'}:
                return self.spreadsheet(document)
            if file_type == '.pptx':
                return self.presentation(document)
            raw = list(self.hybrid.chunk(dl_doc=document))
            chunks = []
            for part in raw:
                headings = list(part.meta.headings or [])
                meta = {**self.provenance(part.meta.doc_items),
                        'title': document.name, 'section': headings[0] if headings else None,
                        'subsection': headings[-1] if len(headings) > 1 else None,
                        'headings': headings}
                if file_type == '.pdf':
                    meta['page'] = meta['page_number']
                text = self.hybrid.contextualize(chunk=part)
                if text.strip():
                    chunks.extend(self.bounded(text, meta) if self.tokens(text) > self.settings.chunk_max_tokens
                                  else [Chunk(text=text, metadata=meta)])
            if document_type == 'form':
                whole = document.export_to_markdown()
                if whole.strip() and self.tokens(whole) <= self.settings.chunk_max_tokens:
                    return [Chunk(text=whole, metadata={
                        'title': document.name, **self.provenance(document.texts + document.tables)})]
            log.info('Generated %s chunks', len(chunks))
            return chunks
        except ParsingError:
            raise
        except Exception as exc:
            log.exception('Chunking failed')
            raise ParsingError('Document chunking failed; check server logs') from exc

    def presentation(self, document):
        chunks = []
        for page in sorted(document.pages):
            # Restrict the structured document before chunking so HybridChunker
            # cannot merge text across slide boundaries.
            slide = document.filter(page_nrs={page})
            whole = slide.export_to_markdown()
            meta = {'title': document.name, 'slide': page, 'page_number': page, 'pages': [page]}
            if whole.strip() and self.tokens(whole) <= self.settings.chunk_max_tokens:
                chunks.append(Chunk(text=whole, metadata=meta))
            else:
                parts = self.chunk(slide, '.docx', 'presentation')
                for part in parts:
                    part.metadata.update(meta)
                chunks.extend(parts)
        return chunks

    def spreadsheet(self, document):
        result = []
        for table in document.tables:
            data = table.data
            rows = defaultdict(list)
            for cell in data.table_cells:
                rows[cell.start_row_offset_idx].append(cell)
            header_rows = {row for row, cells in rows.items() if any(c.column_header for c in cells)}
            def row_text(row):
                return ' | '.join(c.text for c in sorted(rows[row], key=lambda c: c.start_col_offset_idx))
            headers = '\n'.join(row_text(row) for row in sorted(header_rows))
            parent = table.parent.resolve(document) if table.parent else None
            sheet = getattr(parent, 'name', None)
            # Excel backends encode the original cell coordinates in the table
            # bbox; TableCell offsets themselves are relative to that table.
            offset = int(table.prov[0].bbox.t) if table.prov else 0
            prefix = f'{sheet}\n' if sheet else ''
            prefix += headers + '\n' if headers else ''
            pending, start, end = [], None, None
            for row in sorted(rows):
                if row in header_rows:
                    continue
                text = row_text(row)
                if not text.strip(' |'):
                    continue
                meta = {'title': document.name, 'sheet': sheet, 'row_start': offset + row + 1,
                        'row_end': offset + row + 1, **self.provenance([table])}
                candidate = prefix + '\n'.join(pending + [text])
                if pending and self.tokens(candidate) > self.settings.chunk_max_tokens:
                    result.append(Chunk(text=prefix + '\n'.join(pending), metadata={
                        **meta, 'row_start': start, 'row_end': end}))
                    pending, start = [], None
                if self.tokens(prefix + text) > self.settings.chunk_max_tokens:
                    result.extend(self.bounded(prefix + text, meta))
                else:
                    pending.append(text)
                    start = start or offset + row + 1
                    end = offset + row + 1
            if pending:
                result.append(Chunk(text=prefix + '\n'.join(pending), metadata={
                    'title': document.name, 'sheet': sheet, 'row_start': start,
                    'row_end': end, **self.provenance([table])}))
            elif not rows.keys() - header_rows and prefix.strip():
                result.extend(self.bounded(prefix, {'title': document.name, 'sheet': sheet}))
        # Preserve sheet labels and singleton cells that Docling classified as
        # text rather than tables; these must not disappear from the index.
        for item in document.texts:
            if not item.text.strip():
                continue
            parent = item.parent.resolve(document) if item.parent else None
            result.extend(self.bounded(item.text, {'title': document.name,
                'sheet': getattr(parent, 'name', None), **self.provenance([item])}))
        return result
