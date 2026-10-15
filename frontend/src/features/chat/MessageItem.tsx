import { Layers } from 'lucide-react';
import type { ThreadMessage } from '../../api/types';
import { Markdown } from '../../components/Markdown';
import { cx } from '../../lib/cx';
import styles from './MessageItem.module.css';

interface MessageItemProps {
  role: ThreadMessage['role'];
  content: string;
  citations?: ReadonlySet<number>;
  onCitation?: (citation: number) => void;
}

export function MessageItem({ role, content, citations, onCitation }: MessageItemProps) {
  const fromUser = role === 'user';
  return (
    <article className={cx(styles.message, fromUser && styles.user)}>
      <span className={styles.avatar} aria-hidden="true">
        {fromUser ? 'Y' : <Layers size={17} />}
      </span>
      <div className={styles.body}>
        <p className={styles.author}>{fromUser ? 'You' : 'ISO assistant'}</p>
        {fromUser ? (
          <p className={styles.userText}>{content}</p>
        ) : (
          <Markdown citations={citations} onCitation={onCitation}>
            {content}
          </Markdown>
        )}
      </div>
    </article>
  );
}
