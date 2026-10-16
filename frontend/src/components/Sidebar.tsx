import { BookOpen, Layers, MessageSquare, Plus, Trash2 } from 'lucide-react';
import type { View } from '../app/view';
import styles from './Sidebar.module.css';

interface SidebarProps {
  history: readonly { id: string; title: string }[];
  activeThreadId: string;
  onDeleteThread: (id: string) => void;
  onOpenThread: (id: string) => void;
  view: View;
  onNavigate: (view: View) => void;
  onNewChat: () => void;
  newChatDisabled: boolean;
  /** null while the library is still loading. */
  fileCount: number | null;

}

export function Sidebar({
  history,
  activeThreadId,
  onOpenThread,
  onDeleteThread,
  view,
  onNavigate,
  onNewChat,
  newChatDisabled,
  fileCount,
}: SidebarProps) {
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

      <section className={styles.history} aria-labelledby="chat-history-title">
        <h2 id="chat-history-title" className={styles.navLabel}>Chat history</h2>
        {history.length === 0 ? <p className={styles.emptyHistory}>Your conversations will appear here.</p> : (
          <ul className={styles.historyList}>
            {history.map((item) => (
              <li key={item.id} className={styles.historyRow}>
                <button type="button" className={styles.navItem}
                  aria-current={view === 'chat' && activeThreadId === item.id ? 'page' : undefined}
                  disabled={newChatDisabled} onClick={() => onOpenThread(item.id)} title={item.title}>
                  <MessageSquare size={15} aria-hidden="true" />
                  <span className={styles.historyTitle}>{item.title}</span>
                </button>
                <button type="button" className={styles.deleteChat}
                  aria-label={`Delete chat: ${item.title}`} title="Delete chat"
                  onClick={() => onDeleteThread(item.id)}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav className={styles.footer} aria-label="Document library">
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
    </div>
  );
}
