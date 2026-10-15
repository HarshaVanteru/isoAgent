import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import styles from './Notice.module.css';

interface NoticeProps {
  tone?: 'info' | 'error';
  children: ReactNode;
  onDismiss?: () => void;
}

export function Notice({ tone = 'info', children, onDismiss }: NoticeProps) {
  return (
    <div className={cx(styles.notice, styles[tone])} role={tone === 'error' ? 'alert' : 'status'}>
      <span className={styles.message}>{children}</span>
      {onDismiss && (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
