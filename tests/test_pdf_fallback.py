from pathlib import Path
import pytest
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject

from backend.app.core.errors import InvalidFile
from backend.app.ingestion.parser import DoclingParser
from tests.test_local_rag import pipeline


def write_pdf(path, texts):
    writer = PdfWriter()
    font = writer._add_object(DictionaryObject({NameObject('/Type'): NameObject('/Font'),
        NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')}))
    for text in texts:
        page = writer.add_blank_page(width=612, height=792)
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'):
            DictionaryObject({NameObject('/F1'): font})})
        stream = DecodedStreamObject()
        stream.set_data(f'BT /F1 12 Tf 50 700 Td ({text}) Tj ET'.encode())
        page[NameObject('/Contents')] = writer._add_object(stream)
    with path.open('wb') as output:
        writer.write(output)


def test_fallback_preserves_original_page_numbers(tmp_path):
    path = tmp_path / 'diagram.pdf'
    write_pdf(path, ['', 'Evaluate suppliers annually.'])
    doc = DoclingParser().pdf_text_fallback(path)
    assert 'Evaluate suppliers annually.' in doc.export_to_markdown()
    assert doc.texts[-1].prov[0].page_no == 2
    assert set(doc.pages) == {1, 2}


def test_empty_docling_result_uses_pdf_text_and_marks_metadata(pipeline, monkeypatch):
    from docling_core.types.doc import DoclingDocument
    p = pipeline
    path = p.settings.document_dir / 'diagram.pdf'
    write_pdf(path, ['Evaluate suppliers annually.'])
    monkeypatch.setattr(p.ingestion.parser, 'parse', lambda path: DoclingDocument(name='empty'))
    result = p.ingestion.ingest_file(path)
    assert result.chunks > 0
    hit = p.search.search('supplier').results[0]
    assert hit.metadata['extractor'] == 'pypdf_text_fallback'
    assert hit.metadata['page'] == 1
    assert 'Evaluate suppliers annually.' in hit.text


def test_visio_fallback_retains_original_source_type(pipeline, monkeypatch):
    from docling_core.types.doc import DoclingDocument
    p = pipeline
    source = p.settings.document_dir / 'diagram.vsd'
    source.write_bytes(b'visio fixture')
    converted = p.settings.data_dir / 'diagram.pdf'
    converted.parent.mkdir(parents=True, exist_ok=True)
    write_pdf(converted, ['Evaluate suppliers annually.'])
    monkeypatch.setattr(p.ingestion.converter, 'convert', lambda path: converted)
    monkeypatch.setattr(p.ingestion.parser, 'parse', lambda path: DoclingDocument(name='empty'))
    p.ingestion.ingest_file(source)
    hit = p.search.search('supplier').results[0]
    assert hit.metadata['file_type'] == '.vsd'
    assert hit.metadata['document_name'] == 'diagram.vsd'
    assert hit.metadata['page'] == 1


def test_fallback_with_no_text_records_file_failure(pipeline, monkeypatch):
    from docling_core.types.doc import DoclingDocument
    p = pipeline
    path = p.settings.document_dir / 'empty.pdf'
    write_pdf(path, [''])
    monkeypatch.setattr(p.ingestion.parser, 'parse', lambda path: DoclingDocument(name='empty'))
    report = p.ingestion.ingest_folder()
    assert report['files'][0]['status'] == 'error'
    assert 'No extractable content' in report['files'][0]['error']
    assert p.store.count() == 0
    assert p.ingestion.report_path.exists()
