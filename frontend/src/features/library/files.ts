import type { LibraryFile, LibraryReport } from '../../api/types';

export type FileStatus = 'indexed' | 'error' | 'pending';
export type StatusFilter = 'all' | FileStatus;

export interface FileGroup {
  category: string;
  files: LibraryFile[];
}

/** Matches the backend's category for files at the library root. */
export const GENERAL_CATEGORY = 'General';

/** Inventory (files on disk) overlaid with ingestion results, sorted by path. */
export function mergeFiles(report: LibraryReport | null): LibraryFile[] {
  if (!report) return [];
  const bySource = new Map<string, LibraryFile>();
  for (const file of report.inventory) bySource.set(file.source, file);
  for (const file of report.files) bySource.set(file.source, { ...bySource.get(file.source), ...file });
  return [...bySource.values()].sort((a, b) => a.source.localeCompare(b.source));
}

export function categoryOf(source: string): string {
  const slash = source.indexOf('/');
  return slash > 0 ? source.slice(0, slash) : GENERAL_CATEGORY;
}

export function fileName(source: string): string {
  return source.slice(source.lastIndexOf('/') + 1) || source;
}

export function fileStatus(file: LibraryFile): FileStatus {
  if (file.status === 'indexed') return 'indexed';
  if (file.status === 'error') return 'error';
  return 'pending';
}

export function listCategories(files: LibraryFile[]): string[] {
  return [...new Set(files.map((file) => categoryOf(file.source)))].sort((a, b) => a.localeCompare(b));
}

export function filterFiles(files: LibraryFile[], status: StatusFilter, query: string): LibraryFile[] {
  const needle = query.trim().toLowerCase();
  return files.filter(
    (file) =>
      (status === 'all' || fileStatus(file) === status) && (!needle || file.source.toLowerCase().includes(needle)),
  );
}

export function groupByCategory(files: LibraryFile[]): FileGroup[] {
  const groups = new Map<string, LibraryFile[]>();
  for (const file of files) {
    const category = categoryOf(file.source);
    const group = groups.get(category);
    if (group) group.push(file);
    else groups.set(category, [file]);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, groupFiles]) => ({ category, files: groupFiles }));
}

export function countByStatus(files: LibraryFile[]): Record<FileStatus, number> {
  const counts: Record<FileStatus, number> = { indexed: 0, error: 0, pending: 0 };
  for (const file of files) counts[fileStatus(file)] += 1;
  return counts;
}
