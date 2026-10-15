import { BookOpen } from 'lucide-react';
import type { Source } from '../../api/types';
import { SourceCard } from './SourceCard';
import styles from './SourceList.module.css';

interface SourceListProps {
  sources: Source[];
  isExpanded: (citation: number) => boolean;
  onToggle: (citation: number) => void;
}

export function SourceList({ sources, isExpanded, onToggle }: SourceListProps) {
  return (
    <section className={styles.sources} aria-labelledby="sources-title">
      <h2 id="sources-title" className={styles.title}>
        <BookOpen size={14} aria-hidden="true" /> Retrieved sources
        <span className={styles.count}>{sources.length}</span>
      </h2>
      <ol className={styles.list}>
        {sources.map((source) => (
          <li key={String(source.metadata.chunk_id ?? source.citation)}>
            <SourceCard
              source={source}
              expanded={isExpanded(source.citation)}
              onToggle={() => onToggle(source.citation)}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
