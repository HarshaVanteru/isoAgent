import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('turns citations with a source into buttons and leaves others as text', async () => {
    const onCitation = vi.fn();
    render(
      <Markdown citations={new Set([1, 2])} onCitation={onCitation}>
        {'Evaluate suppliers [1][2] and see [7].'}
      </Markdown>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Show source 2' }));
    expect(onCitation).toHaveBeenCalledWith(2);
    expect(screen.queryByRole('button', { name: 'Show source 7' })).toBeNull();
    expect(screen.getByText(/\[7\]/)).toBeInTheDocument();
  });

  it('opens ordinary links in a new tab without opener access', () => {
    render(<Markdown>{'[ISO](https://www.iso.org)'}</Markdown>);
    const link = screen.getByRole('link', { name: 'ISO' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer noopener');
  });

  it('renders citations as plain text when no handler is given', () => {
    render(<Markdown citations={new Set([1])}>{'Answer [1].'}</Markdown>);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
