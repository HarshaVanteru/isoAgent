import { ChevronRight, FileText } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { Skeleton } from '../../components/Skeleton';
import { Spinner } from '../../components/Spinner';
import { scrollBehavior } from '../../lib/motion';
import type { LibraryStatus } from '../library/useLibrary';
import { ClarificationCard } from './ClarificationCard';
import { Composer } from './Composer';
import { MessageItem } from './MessageItem';
import { MessageList } from './MessageList';
import { SourceList } from './SourceList';
import { WelcomeScreen } from './WelcomeScreen';
import type { Conversation } from './useConversation';
import { useSourceFocus } from './useSourceFocus';
import styles from './ChatView.module.css';

const SUGGESTIONS = [
  'What does ISO 9001 require for document control?',
  'How do we handle a customer complaint?',
  'Which forms support supplier evaluation?',
] as const;

interface ChatViewProps {
  conversation: Conversation;
  categories: string[];
  indexedCount: number;
  libraryStatus: LibraryStatus;
  modelLabel: string;
  onOpenLibrary: () => void;
}

export function ChatView({
  conversation,
  categories,
  indexedCount,
  libraryStatus,
  modelLabel,
  onOpenLibrary,
}: ChatViewProps) {
  const { thread, busy, restoring, pendingMessage } = conversation;
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sourceFocus = useSourceFocus(thread.sources);
  const citations = useMemo(() => new Set(thread.sources.map((source) => source.citation)), [thread.sources]);
  // Sources belong to the latest answer only, so only its citations are linked.
  const citedIndex = thread.sources.length ? thread.messages.findLastIndex((m) => m.role === 'assistant') : -1;
  const showWelcome = !restoring && !busy && thread.messages.length === 0 && !thread.pending_clarification;

  useEffect(() => {
    const behavior = scrollBehavior();
    if (!busy && !thread.pending_clarification && thread.messages.length) {
      // Show the start of the newest answer rather than the bottom of its sources.
      const articles = scrollRef.current?.querySelectorAll<HTMLElement>('article');
      articles?.[articles.length - 1]?.scrollIntoView({ behavior, block: 'start' });
    } else {
      endRef.current?.scrollIntoView({ behavior, block: 'end' });
    }
  }, [thread, busy]);

  const placeholder = restoring
    ? 'Loading conversation…'
    : thread.pending_clarification
      ? 'Reply to the clarification…'
      : 'Ask anything about your documents…';

  return (
    <div className={styles.chat}>
      <div ref={scrollRef} className={styles.scroll}>
        {showWelcome ? (
          <WelcomeScreen
            suggestions={SUGGESTIONS}
            disabled={busy || restoring || indexedCount === 0}
            onPick={(suggestion) => void conversation.send(suggestion)}
          />
        ) : (
          <div className={styles.thread} role="log" aria-label="Conversation">
            <MessageList
              messages={thread.messages}
              citedIndex={citedIndex}
              citations={citations}
              onCitation={sourceFocus.reveal}
            />
            {thread.pending_clarification && (
              <ClarificationCard
                request={thread.question}
                question={thread.clarification_question}
                history={thread.clarification_history}
              />
            )}
            {thread.sources.length > 0 && (
              <SourceList sources={thread.sources} isExpanded={sourceFocus.isExpanded} onToggle={sourceFocus.toggle} />
            )}
            {pendingMessage && <MessageItem role="user" content={pendingMessage} />}
            {restoring && <Skeleton lines={3} label="Loading conversation" />}
            {busy && (
              <p className={styles.status} role="status">
                <Spinner size={17} /> Working with your documents…
              </p>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className={styles.composerArea}>
        {libraryStatus !== 'unavailable' && indexedCount === 0 && (
          <p className={styles.indexPrompt}>
            <FileText size={15} aria-hidden="true" />
            {libraryStatus === 'loading'
              ? 'Loading document library…'
              : 'Your document library has not been indexed yet.'}
            <button type="button" onClick={onOpenLibrary}>
              Open library <ChevronRight size={13} aria-hidden="true" />
            </button>
          </p>
        )}
        <Composer
          value={conversation.draft}
          onChange={conversation.setDraft}
          onSubmit={() => void conversation.send()}
          disabled={busy || restoring}
          placeholder={placeholder}
          categories={categories}
          category={conversation.category}
          onCategoryChange={conversation.setCategory}
          categoryDisabled={busy || restoring || thread.pending_clarification}
        />
        <p className={styles.caption}>
          {modelLabel} <span aria-hidden="true">·</span> Answers can be imperfect. Review the evidence.
        </p>
      </div>
    </div>
  );
}
