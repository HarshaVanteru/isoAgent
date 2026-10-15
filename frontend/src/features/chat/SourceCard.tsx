import { ChevronRight } from 'lucide-react';
import type { Source } from '../../api/types';
import { Markdown } from '../../components/Markdown';
import { sourceElementId } from '../../lib/citations';
import { formatMetadataValue, sourceLocation, sourceTitle } from './sourceLabel';
import styles from './SourceCard.module.css';

interface SourceCardProps {
  source: Source;
  expanded: boolean;
  onToggle: () => void;
}

export function SourceCard({ source, expanded, onToggle }: SourceCardProps) {
  const id = sourceElementId(source.citation);
  const location = sourceLocation(source);
  return (
    <div id={id} className={styles.card} data-expanded={expanded || undefined}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={expanded}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
      >
        <span className={styles.number}>{source.citation}</span>
        <span className={styles.label}>
          <span className={styles.name}>{sourceTitle(source)}</span>
          {location && <small className={styles.location}>{location}</small>}
        </span>
        <ChevronRight size={16} className={styles.chevron} aria-hidden="true" />
      </button>
      <div id={`${id}-panel`} className={styles.panel} hidden={!expanded}>
        <Markdown>{source.text}</Markdown>
        <dl className={styles.metadata}>
          {Object.entries(source.metadata).map(([key, value]) => (
            <div key={key}>
              <dt>{key.replaceAll('_', ' ')}</dt>
              <dd>{formatMetadataValue(value)}</dd>
            </div>
          ))}
          <div>
            <dt>relevance score</dt>
            <dd>{source.score.toFixed(3)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
