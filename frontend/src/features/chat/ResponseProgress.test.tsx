import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ResponseProgress } from './ResponseProgress';

afterEach(() => vi.useRealTimers());
it('shows the current stage and a gentle hint after fifteen seconds', () => {
  vi.useFakeTimers();
  const { rerender, unmount } = render(<ResponseProgress stage="retrieval" />);
  expect(screen.getByRole('status')).toHaveTextContent('Searching your documents');
  act(() => vi.advanceTimersByTime(15000));
  expect(screen.getByText('Working ? 15s')).toBeInTheDocument();
  expect(screen.getByText(/Still working on your response/)).toBeInTheDocument();
  rerender(<ResponseProgress stage="reranking" />);
  expect(screen.getByRole('status')).toHaveTextContent('Comparing the most relevant passages');
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
