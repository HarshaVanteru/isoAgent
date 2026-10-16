import styles from './LibraryStats.module.css';

interface LibraryStatsProps {
  total: number;
  indexed: number;
  chunks: number;
  loading: boolean;
}

export function LibraryStats({ total, indexed, chunks, loading }: LibraryStatsProps) {
  const stats = [
    { label: 'Source documents', value: total },
    { label: 'Indexed successfully', value: indexed },
    { label: 'Searchable chunks', value: chunks },
  ];
  return (
    <dl className={styles.stats}>
      {stats.map(({ label, value }) => (
        <div key={label} className={styles.stat}>
          <dt className={styles.label}>{label}</dt>
          <dd className={styles.value}>{loading ? '—' : value.toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}
