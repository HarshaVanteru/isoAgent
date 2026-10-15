import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';

function renderShell() {
  render(
    <AppShell
      title="Ask your documents"
      sidebar={(closeDrawer) => (
        <button type="button" onClick={closeDrawer}>
          Document library
        </button>
      )}
    >
      <p>content</p>
    </AppShell>,
  );
  return screen.getByRole('button', { name: 'Toggle navigation' });
}

describe('AppShell', () => {
  it('opens the drawer, focuses the sidebar, and closes on Escape returning focus', async () => {
    const user = userEvent.setup();
    const menu = renderShell();
    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Document library' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveFocus();
  });

  it('lets the sidebar close the drawer after navigation', async () => {
    const user = userEvent.setup();
    const menu = renderShell();
    await user.click(menu);
    await user.click(screen.getByRole('button', { name: 'Document library' }));
    expect(menu).toHaveAttribute('aria-expanded', 'false');
  });

  it('exposes landmarks and a skip link', () => {
    renderShell();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeInTheDocument();
  });
});
