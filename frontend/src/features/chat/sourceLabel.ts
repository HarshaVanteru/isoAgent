import type { MetadataValue, Source } from '../../api/types';

type Present = Exclude<MetadataValue, null>;

const present = (value: MetadataValue | undefined): value is Present =>
  value !== null && value !== undefined && value !== '';

export function sourceTitle({ metadata }: Source): string {
  const name = [metadata.document_name, metadata.filename, metadata.source].find(present);
  return name === undefined ? 'Document' : String(name);
}

export function sourceLocation({ metadata }: Source): string {
  const page = present(metadata.page) ? metadata.page : metadata.page_number;
  const parts: string[] = [];
  if (present(page)) parts.push(`Page ${String(page)}`);
  else if (present(metadata.slide)) parts.push(`Slide ${String(metadata.slide)}`);
  else if (present(metadata.sheet)) parts.push(`Sheet: ${String(metadata.sheet)}`);
  else if (present(metadata.category)) parts.push(String(metadata.category));
  if (present(metadata.chunk_index)) parts.push(`Chunk ${String(metadata.chunk_index)}`);
  return parts.join(' · ');
}

export function formatMetadataValue(value: MetadataValue | undefined): string {
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  return present(value) ? String(value) : '—';
}
