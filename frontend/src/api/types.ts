export type MetadataValue = string | number | boolean | null | string[] | number[];

export interface Source {
  text: string;
  score: number;
  vector_score?: number;
  citation: number;
  metadata: Record<string, MetadataValue>;
}

export interface ThreadMessage {
  role: 'user' | 'assistant';
  response_time_seconds?: number | null;
  content: string;
}

export interface ClarificationExchange {
  question: string;
  answer: string;
}

export interface Thread {
  thread_id: string;
  category: string;
  pending_clarification: boolean;
  clarification_question: string;
  clarification_history: ClarificationExchange[];
  messages: ThreadMessage[];
  question: string;
  answer: string;
  sources: Source[];
}

export interface LibraryFile {
  source: string;
  file_type: string;
  size_bytes?: number;
  supported?: boolean;
  document_id?: string;
  document_name?: string;
  status?: 'indexed' | 'error';
  chunks?: number;
  error?: string;
}

export interface LibraryReport {
  files: LibraryFile[];
  inventory: LibraryFile[];
  chunks: number;
  indexed_at: string | null;
}

export interface Health {
  status: string;
  groq_configured: boolean;
  model: string;
  embedding_model: string;
  reranker_model: string;
}
