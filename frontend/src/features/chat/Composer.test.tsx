import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Composer } from './Composer';

function Harness({ onSubmit, disabled = false }: { onSubmit: () => void; disabled?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <Composer
      value={value}
      onChange={setValue}
      onSubmit={onSubmit}
      disabled={disabled}
      placeholder="Ask anything"
      categories={['Purchasing']}
      category=""
      onCategoryChange={() => {}}
      categoryDisabled={false}
    />
  );
}

describe('Composer', () => {
  it('sends on Enter and inserts a newline on Shift+Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox', { name: 'Your question' });
    await user.type(box, 'Hello{Shift>}{Enter}{/Shift}there');
    expect(box).toHaveValue('Hello\nthere');
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not send blank input', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: 'Your question' }), '   {Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send question' })).toBeDisabled();
  });

  it('does not send while an IME composition is active', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox', { name: 'Your question' });
    fireEvent.change(box, { target: { value: 'にほん' } });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('offers the document categories', () => {
    render(<Harness onSubmit={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Document category' });
    expect(select).toHaveDisplayValue('All documents');
    expect(screen.getByRole('option', { name: 'Purchasing' })).toBeInTheDocument();
  });
});
