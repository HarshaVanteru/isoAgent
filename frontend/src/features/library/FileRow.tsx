import { FileText } from 'lucide-react';
import type { LibraryFile } from '../../api/types';
import { fileName, fileStatus } from './files';
import styles from './FileRow.module.css';

const STATUS_LABEL = { error: 'Needs attention', pending: 'Not indexed' } as const;

export function FileRow({ file }: { file: LibraryFile }) {
  const status = fileStatus(file);
  const label = status === 'indexed' ? `${file.chunks ?? 0} chunks` : STATUS_LABEL[status];
  const name = fileName(file.source);
  return (
    <li className={styles.row}>
      <FileText size={20} className={styles.icon} aria-hidden="true" />
      <div className={styles.info}>
        <p className={styles.name}>{name}</p>
        {name !== file.source && <p className={styles.path}>{file.source}</p>}
        {file.error && <p className={styles.error}>{file.error}</p>}
      </div>
      <span className={styles.status} data-status={status}>
        {label}
      </span>
    </li>
  );
}
