/**
 * Small shared controls for the settings panel. Hand-written rather than pulled
 * from a UI library — part 0 section 3 rules out heavy UI dependencies.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
}): ReactNode {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-vellum/70">{label}</span>
      {children}
      {hint !== undefined && <span className="text-xs text-vellum/40">{hint}</span>}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>): ReactNode {
  const { className = '', ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full rounded border border-oak-light bg-ink px-2 py-1.5 text-sm text-parchment placeholder:text-vellum/30 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>): ReactNode {
  const { className = '', ...rest } = props;
  return (
    <select
      {...rest}
      className={`w-full rounded border border-oak-light bg-ink px-2 py-1.5 text-sm text-parchment disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    />
  );
}

export function Button({
  variant = 'normal',
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'normal' | 'primary' | 'danger' }): ReactNode {
  const tone =
    variant === 'primary'
      ? 'border-brass text-brass hover:bg-brass/10'
      : variant === 'danger'
        ? 'border-blood text-red-300 hover:bg-blood/20'
        : 'border-oak-light text-vellum hover:bg-oak-light';
  return (
    <button
      type="button"
      {...rest}
      className={`rounded border px-2.5 py-1.5 text-xs tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tone} ${className}`}
    />
  );
}

/** Ô mật khẩu có nút con mắt (Phần 1 mục 7). */
export function PasswordInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}): ReactNode {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex gap-1">
      <TextInput
        type={shown ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
      <Button
        onClick={() => setShown((previous) => !previous)}
        aria-label={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
        title={shown ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
      >
        {shown ? '🙈' : '👁'}
      </Button>
    </div>
  );
}

export function Warning({ level, children }: { level: 'warn' | 'info'; children: ReactNode }): ReactNode {
  return (
    <p
      className={`rounded border-l-2 px-2 py-1 text-xs ${
        level === 'warn' ? 'border-amber-500 bg-amber-500/10 text-amber-200' : 'border-oak-light bg-oak-light/30 text-vellum/70'
      }`}
    >
      {children}
    </p>
  );
}

/** Điều khiển con trỏ từ bên ngoài — bảng tra cứu của Phần 3 mục 11 cần nó. */
export interface CodeEditorHandle {
  /** Chèn chữ vào đúng vị trí con trỏ hiện tại. */
  insert(text: string): void;
}

/** Trình soạn mã cho tab Script (Phần 1 mục 6.8) và editor template (Phần 3 mục 11). */
export function CodeEditor({
  value,
  onChange,
  readOnly = false,
  height = '14rem',
  handle,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string;
  handle?: React.MutableRefObject<CodeEditorHandle | null>;
}): ReactNode {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (host.current === null) return undefined;

    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          javascript(),
          oneDark,
          EditorView.editable.of(!readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current?.(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    if (handle !== undefined) {
      handle.current = {
        insert(text: string): void {
          const { from, to } = editor.state.selection.main;
          editor.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length },
          });
          editor.focus();
        },
      };
    }
    return () => {
      editor.destroy();
      view.current = null;
      if (handle !== undefined) handle.current = null;
    };
    // Rebuilding on every keystroke would fight the editor's own state, so the
    // document is only pushed in from outside when the identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly]);

  useEffect(() => {
    const editor = view.current;
    if (editor === null) return;
    if (editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} style={{ height }} className="overflow-auto rounded border border-oak-light text-xs" />;
}
