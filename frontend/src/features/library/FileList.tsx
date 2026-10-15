import { Skeleton } from '../../components/Skeleton';
import { FileRow } from './FileRow';
import type { FileGroup } from './files';
import type { LibraryStatus } from './useLibrary';
import styles from './FileList.module.css';

interface FileListProps {
  status: LibraryStatus;
  groups: FileGroup[];
  emptyMessage: string;
}

export function FileList({ status, groups, emptyMessage }: FileListProps) {
  if (status === 'loading') return <Skeleton lines={6} label="Loading documents" />;
  if (status === 'unavailable') {
    return <p className={styles.empty}>The document library is unavailable. Check that the backend is running.</p>;
  }
  if (groups.length === 0) return <p className={styles.empty}>{emptyMessage}</p>;
  return (
    <div className={styles.groups}>
      {groups.map(({ category, files }) => (
        <section key={category}>
          <h2 className={styles.groupTitle}>
            {category} <span className={styles.groupCount}>{files.length}</span>
          </h2>
          <ul className={styles.list}>
            {files.map((file) => (
              <FileRow key={file.source} file={file} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
