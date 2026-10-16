import { LoaderCircle } from 'lucide-react';
import styles from './Spinner.module.css';

export function Spinner({ size = 16 }: { size?: number }) {
  return <LoaderCircle size={size} className={styles.spinner} aria-hidden="true" />;
}
