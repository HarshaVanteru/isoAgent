import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Thread } from '../../api/types';
import { ChatView } from './ChatView';
import { emptyThread, type Conversation } from './useConversation';

function conversation(thread: Partial<Thread> = {}, overrides: Partial<Conversation> = {}): Conversation {
  return {
    thread: { ...emptyThread(), ...thread },
    category: '',
    setCategory: vi.fn(),
    draft: '',
    setDraft: vi.fn(),
    restoring: false,
    busy: false,
    pendingMessage: '',
    error: null,
    dismissError: vi.fn(),
    send: vi.fn(async () => {}),
    reset: vi.fn(),
    ...overrides,
  };
}

const answered: Partial<Thread> = {
  thread_id: 't1',
  messages: [
    { role: 'user', content: 'How are suppliers evaluated?' },
    { role: 'assistant', content: 'Annually [1].' },
  ],
  sources: [
    {
      text: 'Evaluate suppliers annually.',
      score: 4.2,
      citation: 1,
      metadata: { document_name: 'OP-07 Supplier evaluation.docx', page: 2, chunk_index: 0 },
    },
  ],
};

const renderChat = (value: Conversation) =>
  render(
    <ChatView
      conversation={value}
      categories={[]}
      indexedCount={3}
      libraryStatus="ready"
      modelLabel="model via Groq"
      onOpenLibrary={vi.fn()}
    />,
  );

describe('ChatView', () => {
  it('shows suggestions for a new conversation and sends the one picked', async () => {
    const value = conversation();
    renderChat(value);
    await userEvent.click(screen.getByRole('button', { name: /customer complaint/ }));
    expect(value.send).toHaveBeenCalledWith('How do we handle a customer complaint?');
  });

  it('keeps the welcome screen at the top instead of auto-scrolling', () => {
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderChat(conversation());
    expect(scroll).not.toHaveBeenCalled();
    scroll.mockRestore();
  });

  it('expands the cited source when a citation is clicked', async () => {
    renderChat(conversation(answered));
    const source = screen.getByRole('button', { name: /OP-07 Supplier evaluation\.docx/ });
    expect(source).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Show source 1' }));
    expect(source).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Evaluate suppliers annually.')).toBeVisible();
  });

  it('shows the clarification request and adapts the composer', () => {
    renderChat(
      conversation({
        thread_id: 't1',
        pending_clarification: true,
        question: 'How is it controlled?',
        clarification_question: 'Which procedure do you mean?',
      }),
    );
    expect(screen.getByText('Which procedure do you mean?')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your question' })).toHaveAttribute(
      'placeholder',
      'Reply to the clarification…',
    );
    expect(screen.getByRole('combobox', { name: 'Document category' })).toBeDisabled();
  });

  it('prompts to open the library when nothing is indexed', async () => {
    const onOpenLibrary = vi.fn();
    render(
      <ChatView
        conversation={conversation()}
        categories={[]}
        indexedCount={0}
        libraryStatus="ready"
        modelLabel="m"
        onOpenLibrary={onOpenLibrary}
      />,
    );
    expect(screen.getByText('Your document library has not been indexed yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Open library/ }));
    expect(onOpenLibrary).toHaveBeenCalled();
  });
});
