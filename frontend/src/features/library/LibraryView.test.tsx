import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { LibraryFile } from '../../api/types';
import { LibraryView } from './LibraryView';

const files: LibraryFile[] = [
  { source: 'Manual.pdf', file_type: '.pdf' },
  { source: 'Purchasing/Broken.vsd', file_type: '.vsd', status: 'error', error: 'LibreOffice is not installed' },
  { source: 'Purchasing/OP-01 Supplier.docx', file_type: '.docx', status: 'indexed', chunks: 4 },
];

describe('LibraryView', () => {
  it('groups by category, filters by status, and searches', async () => {
    const user = userEvent.setup();
    render(<LibraryView files={files} indexedCount={1} chunkCount={4} status="ready" indexedAt={null} />);
    expect(screen.getByRole('heading', { name: /^Purchasing/ })).toBeInTheDocument();
    expect(screen.getByText('4 chunks')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Needs attention/ }));
    expect(screen.getByText('Broken.vsd')).toBeInTheDocument();
    expect(screen.getByText('LibreOffice is not installed')).toBeInTheDocument();
    expect(screen.queryByText('OP-01 Supplier.docx')).toBeNull();

    await user.click(screen.getByRole('button', { name: /^All/ }));
    await user.type(screen.getByRole('searchbox', { name: 'Search documents' }), 'manual');
    expect(screen.getByText('Manual.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Broken.vsd')).toBeNull();
  });

  it('explains an empty library and a failed connection', () => {
    const { rerender } = render(
      <LibraryView files={[]} indexedCount={0} chunkCount={0} status="ready" indexedAt={null} />,
    );
    expect(screen.getByText(/No documents found/)).toBeInTheDocument();
    rerender(<LibraryView files={[]} indexedCount={0} chunkCount={0} status="unavailable" indexedAt={null} />);
    expect(screen.getByText(/library is unavailable/)).toBeInTheDocument();
  });
});
