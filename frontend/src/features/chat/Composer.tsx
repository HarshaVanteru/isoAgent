import { ArrowUp, Layers } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import styles from './Composer.module.css';

const MAX_HEIGHT_PX = 200;

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  sendDisabled?: boolean;
  placeholder: string;
  categories: string[];
  category: string;
  onCategoryChange: (category: string) => void;
  categoryDisabled: boolean;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  disabled,
  sendDisabled = false,
  placeholder,
  categories,
  category,
  onCategoryChange,
  categoryDisabled,
}: ComposerProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const wasDisabled = useRef(disabled);
  const canSend = !disabled && !sendDisabled && value.trim().length > 0;

  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  // Return focus after a request finishes, except on touch devices where it pops the keyboard.
  useEffect(() => {
    if (wasDisabled.current && !disabled && !window.matchMedia('(pointer: coarse)').matches) {
      textarea.current?.focus();
    }
    wasDisabled.current = disabled;
  }, [disabled]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSend) onSubmit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Safari fires the IME-confirming Enter after compositionend, flagged only by keyCode 229.
    const composing = event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
    if (event.key !== 'Enter' || event.shiftKey || composing) return;
    event.preventDefault();
    if (canSend) onSubmit();
  };

  return (
    <form className={styles.composer} onSubmit={submit}>
      <label htmlFor="composer-input" className="visually-hidden">
        Your question
      </label>
      <textarea
        id="composer-input"
        ref={textarea}
        className={styles.input}
        rows={1}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        aria-describedby="composer-hint"
      />
      <div className={styles.toolbar}>
        <label className={styles.category}>
          <Layers size={14} aria-hidden="true" />
          <span className="visually-hidden">Document category</span>
          <select
            value={category}
            disabled={categoryDisabled}
            onChange={(event) => onCategoryChange(event.target.value)}
          >
            <option value="">All documents</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span id="composer-hint" className={styles.hint}>
          <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
        </span>
        <button type="submit" className={styles.send} aria-label="Send question" disabled={!canSend}>
          <ArrowUp size={19} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
