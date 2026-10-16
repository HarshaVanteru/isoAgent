import { useState } from 'react';
import { Notice } from '../components/Notice';
import { Sidebar } from '../components/Sidebar';
import { ChatView } from '../features/chat/ChatView';
import { useConversation } from '../features/chat/useConversation';
import { LibraryView } from '../features/library/LibraryView';
import { useLibrary } from '../features/library/useLibrary';
import { useHealth } from '../hooks/useHealth';
import { AppShell } from './AppShell';
import type { View } from './view';
import styles from './App.module.css';

const TITLES: Record<View, string> = { chat: 'Ask your documents', library: 'Document library' };

export default function App() {
  const [view, setView] = useState<View>('chat');
  const conversation = useConversation();
  const library = useLibrary({ paused: conversation.busy });
  const health = useHealth();
  const showGroqNotice = health !== null && !health.groq_configured;
  const hasNotices = Boolean(conversation.error || library.error || showGroqNotice);

  return (
    <AppShell
      title={TITLES[view]}
      sidebar={(closeDrawer) => (
        <Sidebar
          history={conversation.history}
          onDeleteThread={(id) => void conversation.deleteThread(id)}
          activeThreadId={conversation.thread.thread_id}
          onOpenThread={(id) => {
            void conversation.openThread(id);
            setView('chat');
            closeDrawer();
          }}
          view={view}
          onNavigate={(next) => {
            setView(next);
            closeDrawer();
          }}
          onNewChat={() => {
            conversation.reset();
            setView('chat');
            closeDrawer();
          }}
          newChatDisabled={false}
          fileCount={library.status === 'ready' ? library.files.length : null}
        />
      )}
    >
      {hasNotices && (
        <div className={styles.notices}>
          {conversation.error && (
            <Notice tone="error" onDismiss={conversation.dismissError}>
              {conversation.error}
            </Notice>
          )}
          {library.error && (
            <Notice tone="error" onDismiss={library.dismissError}>
              {library.error}
            </Notice>
          )}
          {showGroqNotice && (
            <Notice>Add your GROQ_API_KEY to backend/.env and restart the backend to enable answers.</Notice>
          )}
        </div>
      )}
      {view === 'library' ? (
        <LibraryView
          files={library.files}
          indexedCount={library.indexedCount}
          chunkCount={library.chunkCount}
          status={library.status}
          indexedAt={library.indexedAt}
        />
      ) : (
        <ChatView
          conversation={conversation}
          categories={library.categories}
          indexedCount={library.indexedCount}
          libraryStatus={library.status}
          modelLabel={health?.model ? `${health.model} via Groq` : 'ISO assistant'}
          onOpenLibrary={() => setView('library')}
        />
      )}
    </AppShell>
  );
}
