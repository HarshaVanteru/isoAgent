import type { ThreadMessage } from '../../api/types';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  messages: ThreadMessage[];
  /** Index of the message whose [n] citations map to the current sources (-1 for none). */
  citedIndex: number;
  citations: ReadonlySet<number>;
  onCitation: (citation: number) => void;
}

export function MessageList({ messages, citedIndex, citations, onCitation }: MessageListProps) {
  return messages.map((message, index) => {
    const cited = index === citedIndex;
    return (
      <MessageItem
        key={index}
        role={message.role}
        content={message.content}
        responseTimeSeconds={message.response_time_seconds}
        citations={cited ? citations : undefined}
        onCitation={cited ? onCitation : undefined}
      />
    );
  });
}
