import { BookOpen, ChevronRight, ShieldCheck } from 'lucide-react';
import styles from './WelcomeScreen.module.css';

interface WelcomeScreenProps {
  suggestions: readonly string[];
  disabled: boolean;
  onPick: (suggestion: string) => void;
}

export function WelcomeScreen({ suggestions, disabled, onPick }: WelcomeScreenProps) {
  return (
    <section className={styles.welcome} aria-labelledby="welcome-title">
      <div className={styles.mark} aria-hidden="true">
        <BookOpen size={29} />
        <span className={styles.spark}>✦</span>
      </div>
      <p className="eyebrow">Clarity, backed by your documents</p>
      <h1 id="welcome-title" className={styles.title}>
        Your next answer is already in your files.
      </h1>
      <p className={styles.lead}>
        Explore your ISO 9001 knowledge base. Ask a question, check the sources, and make it yours.
      </p>
      <ul className={styles.suggestions}>
        {suggestions.map((suggestion, index) => (
          <li key={suggestion}>
            <button type="button" onClick={() => onPick(suggestion)} disabled={disabled}>
              <span className={styles.number} aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span className={styles.text}>{suggestion}</span>
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.foot}>
        <ShieldCheck size={14} aria-hidden="true" /> Grounded in your documents
        <span aria-hidden="true">·</span> Ask follow-up questions
      </p>
    </section>
  );
}
