import { BookOpen, Database, Layers, MessageSquare, Plus, ShieldCheck } from 'lucide-react';
import type { View } from '../app/view';
import styles from './Sidebar.module.css';

interface SidebarProps {
  view: View;
  onNavigate: (view: View) => void;
  onNewChat: () => void;
  newChatDisabled: boolean;
  /** null while the library is still loading. */
  fileCount: number | null;
  indexedCount: number;
  chunkCount: number;
  /** null until the first library request settles. */
  online: boolean | null;
}

const CONNECTION_LABEL = {
  online: 'Backend connected',
  offline: 'Backend unreachable',
  unknown: 'Checking backend',
} as const;

export function Sidebar({
  view,
  onNavigate,
  onNewChat,
  newChatDisabled,
  fileCount,
  indexedCount,
  chunkCount,
  online,
}: SidebarProps) {
  const connection = online === null ? 'unknown' : online ? 'online' : 'offline';
  return (
    <div className={styles.sidebar}>
      <a className={styles.brand} href="/" aria-label="ISO knowledge workspace home">
        <span className={styles.brandIcon} aria-hidden="true">
          <Layers size={22} />
        </span>
        <span className={styles.brandText} aria-hidden="true">
          iso<span className={styles.brandDot}>.</span>
          <small>Knowledge workspace</small>
        </span>
      </a>

      <button type="button" className={styles.newChat} onClick={onNewChat} disabled={newChatDisabled}>
        <Plus size={16} aria-hidden="true" /> New conversation
      </button>

      <nav className={styles.nav} aria-labelledby="sidebar-nav-label">
        <p id="sidebar-nav-label" className={styles.navLabel}>
          Workspace
        </p>
        <button
          type="button"
          className={styles.navItem}
          aria-current={view === 'chat' ? 'page' : undefined}
          onClick={() => onNavigate('chat')}
        >
          <MessageSquare size={17} aria-hidden="true" /> Ask your documents
        </button>
        <button
          type="button"
          className={styles.navItem}
          aria-current={view === 'library' ? 'page' : undefined}
          onClick={() => onNavigate('library')}
        >
          <BookOpen size={17} aria-hidden="true" /> Document library
          <span className={styles.count}>{fileCount ?? '—'}</span>
        </button>
      </nav>

      <section className={styles.card} aria-labelledby="sidebar-card-title">
        <ShieldCheck size={19} className={styles.cardIcon} aria-hidden="true" />
        <h2 id="sidebar-card-title" className={styles.cardTitle}>
          Your documents. Clear answers.
        </h2>
        <p className={styles.cardText}>
          Ask naturally and get answers with sources. The assistant asks a follow-up when it needs more detail.
        </p>
      </section>

      <div className={styles.status}>
        <Database size={16} aria-hidden="true" />
        <div>
          Local knowledge base
          <small>
            {indexedCount} documents · {chunkCount} chunks
          </small>
        </div>
        <span
          className={styles.dot}
          data-state={connection}
          role="img"
          aria-label={CONNECTION_LABEL[connection]}
          title={CONNECTION_LABEL[connection]}
        />
      </div>
    </div>
  );
}
