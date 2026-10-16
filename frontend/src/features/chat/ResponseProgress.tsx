import { useEffect, useState } from 'react';
import { Spinner } from '../../components/Spinner';
import styles from './ChatView.module.css';

const LABELS: Record<string, string> = {
  queued: 'Getting ready?',
  conversation_router: 'Understanding your question?',
  query_analysis: 'Understanding your question?',
  query_expansion: 'Preparing your document search?',
  multi_query_generation: 'Preparing your document search?',
  retrieval: 'Searching your documents?',
  reranking: 'Comparing the most relevant passages?',
  retrieval_quality_check: 'Checking whether the sources support an answer?',
  reformulate_query: 'Looking for stronger supporting evidence?',
  generate_draft: 'Writing your answer?',
  direct_response: 'Writing your answer?',
  clarification: 'Preparing a follow-up question?',
  await_clarification: 'Preparing a follow-up question?',
  insufficient_evidence: 'Summarizing what the documents support?',
  finalize_answer: 'Finishing your answer?',
};

export function ResponseProgress({ stage, startedAt }: { stage: string; startedAt?: number }) {
  const [started] = useState(() => startedAt ?? Date.now());
  const [elapsed, setElapsed] = useState(() => Math.floor((Date.now() - started) / 1000));
  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [started]);
  return (
    <div className={styles.progress}>
      <p className={styles.status} role="status" aria-live="polite">
        <Spinner size={17} /> {LABELS[stage] ?? 'Working with your documents?'}
      </p>
      <p className={styles.elapsed} aria-live="off">Working ? {elapsed}s</p>
      {elapsed >= 15 && <p className={styles.waitHint}>Still working on your response. You can leave this tab open.</p>}
    </div>
  );
}
