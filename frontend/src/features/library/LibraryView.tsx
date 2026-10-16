import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LibraryFile } from '../../api/types';
import { FileList } from './FileList';
import { LibraryStats } from './LibraryStats';
import { countByStatus, filterFiles, groupByCategory, type StatusFilter } from './files';
import type { LibraryStatus } from './useLibrary';
import styles from './LibraryView.module.css';

const FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'indexed', label: 'Indexed' },
  { value: 'error', label: 'Needs attention' },
  { value: 'pending', label: 'Not indexed' },
];

interface LibraryViewProps {
  files: LibraryFile[];
  indexedCount: number;
  chunkCount: number;
  status: LibraryStatus;
  indexedAt: string | null;
}

export function LibraryView({ files, indexedCount, chunkCount, status, indexedAt }: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const counts = useMemo(() => countByStatus(files), [files]);
  const groups = useMemo(() => groupByCategory(filterFiles(files, filter, query)), [files, filter, query]);
  const lastIndexed = formatTimestamp(indexedAt);

  return (
    <section className={styles.page} aria-labelledby="library-title">
      <div className={styles.inner}>
        <p className="eyebrow">Your source of truth</p>
        <h1 id="library-title" className={styles.title}>
          Document library
        </h1>
        <p className={styles.lead}>
          Documents indexed by the ingestion command appear here.
          {lastIndexed && ` Last indexed ${lastIndexed}.`}
        </p>

        <LibraryStats total={files.length} indexed={indexedCount} chunks={chunkCount} loading={status === 'loading'} />

        <p className={styles.note}>
          PDF · Word · Excel · PowerPoint · Visio. Visio and legacy Office files need LibreOffice. Files that need
          attention show their error below.
        </p>

        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search size={15} aria-hidden="true" />
            <span className="visually-hidden">Search documents</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or folder"
            />
          </label>
          <div className={styles.filters} role="group" aria-label="Filter by status">
            {FILTERS.map(({ value, label }) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
                {label} <span className={styles.filterCount}>{value === 'all' ? files.length : counts[value]}</span>
              </button>
            ))}
          </div>
        </div>

        <FileList
          status={status}
          groups={groups}
          emptyMessage={
            files.length === 0
              ? 'No documents found. Add files to DOCUMENT_DIR and run the ingestion command.'
              : 'No documents match your search and filter.'
          }
        />
      </div>
    </section>
  );
}

function formatTimestamp(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
