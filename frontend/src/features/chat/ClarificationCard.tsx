import { MessageSquare } from 'lucide-react';
import type { ClarificationExchange } from '../../api/types';
import { Markdown } from '../../components/Markdown';
import styles from './ClarificationCard.module.css';

interface ClarificationCardProps {
  request: string;
  question: string;
  history: ClarificationExchange[];
}

export function ClarificationCard({ request, question, history }: ClarificationCardProps) {
  return (
    <section className={styles.card} aria-labelledby="clarification-title">
      <p id="clarification-title" className={styles.heading}>
        <MessageSquare size={16} aria-hidden="true" /> A detail before I search
      </p>
      <p className={styles.request}>
        <strong>Your request:</strong> {request}
      </p>
      {history.length > 0 && (
        <ol className={styles.history} aria-label="Earlier clarifications">
          {history.map((exchange, index) => (
            <li key={index}>
              <p>
                <strong>Assistant:</strong> {exchange.question}
              </p>
              <p>
                <strong>You:</strong> {exchange.answer}
              </p>
            </li>
          ))}
        </ol>
      )}
      <Markdown>{question}</Markdown>
      <p className={styles.hint}>Reply in the message box below to continue.</p>
    </section>
  );
}
