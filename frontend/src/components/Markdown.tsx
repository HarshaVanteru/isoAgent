import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { citationFromHref, linkCitations } from '../lib/citations';
import styles from './Markdown.module.css';

interface MarkdownProps {
  children: string;
  /** Citation numbers that have a retrieved source; only these become buttons. */
  citations?: ReadonlySet<number>;
  onCitation?: (citation: number) => void;
}

export function Markdown({ children, citations, onCitation }: MarkdownProps) {
  const linkable = Boolean(onCitation && citations?.size);
  const components: Components = {
    a({ href, children: label }) {
      const citation = linkable ? citationFromHref(href) : null;
      if (citation !== null && onCitation) {
        return (
          <button
            type="button"
            className={styles.citation}
            onClick={() => onCitation(citation)}
            aria-label={`Show source ${citation}`}
          >
            {citation}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer noopener">
          {label}
        </a>
      );
    },
  };
  const text = linkable && citations ? linkCitations(children, citations) : children;
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
