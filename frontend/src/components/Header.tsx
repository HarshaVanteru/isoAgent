import { Menu, ShieldCheck } from 'lucide-react';
import type { Ref } from 'react';
import styles from './Header.module.css';

interface HeaderProps {
  title: string;
  menuOpen: boolean;
  onMenuToggle: () => void;
  menuButtonRef: Ref<HTMLButtonElement>;
}

export function Header({ title, menuOpen, onMenuToggle, menuButtonRef }: HeaderProps) {
  return (
    <header className={styles.header}>
      <button
        ref={menuButtonRef}
        type="button"
        className={styles.menu}
        onClick={onMenuToggle}
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
        aria-controls="app-sidebar"
      >
        <Menu size={20} aria-hidden="true" />
      </button>
      <span className="visually-hidden">{title}</span>
      <span className={styles.badge}>
        <ShieldCheck size={14} aria-hidden="true" /> Answers with sources
      </span>
    </header>
  );
}
