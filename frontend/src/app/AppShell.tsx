import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Header } from '../components/Header';
import styles from './AppShell.module.css';

interface AppShellProps {
  title: string;
  /** Receives a callback that closes the mobile drawer (call it after navigating). */
  sidebar: (closeDrawer: () => void) => ReactNode;
  children: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled])';

export function AppShell({ title, sidebar, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const closeDrawer = useCallback(() => {
    if (!drawerOpen) return;
    setDrawerOpen(false);
    menuButton.current?.focus();
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    sidebarRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setDrawerOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className={styles.shell} data-drawer-open={drawerOpen || undefined}>
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <aside id="app-sidebar" ref={sidebarRef} className={styles.sidebar} aria-label="Sidebar">
        {sidebar(closeDrawer)}
      </aside>
      {drawerOpen && <div className={styles.backdrop} onClick={closeDrawer} aria-hidden="true" />}
      <div className={styles.main}>
        <Header
          title={title}
          menuOpen={drawerOpen}
          onMenuToggle={() => setDrawerOpen((open) => !open)}
          menuButtonRef={menuButton}
        />
        <main id="main-content" className={styles.content} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
