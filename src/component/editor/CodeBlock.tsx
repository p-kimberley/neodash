import React, { useMemo } from 'react';

/**
 * Read-only code block with syntax colours for JSON and YAML, using the --nd-code-* tokens so it
 * reads well in both appearances. Line numbers are drawn with a CSS counter (see .nd-code-block).
 */

type Language = 'json' | 'yaml' | 'text';
type Token = { text: string; kind?: string };

const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([{}[\],])/g;

function tokenizeJson(line: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of line.matchAll(JSON_TOKEN)) {
    const index = m.index ?? 0;
    if (index > last) {
      out.push({ text: line.slice(last, index) });
    }
    if (m[1] !== undefined) {
      out.push({ text: m[1], kind: m[2] ? 'property' : 'string' });
      if (m[2]) {
        out.push({ text: m[2], kind: 'punctuation' });
      }
    } else if (m[3]) {
      out.push({ text: m[3], kind: 'literal' });
    } else if (m[4]) {
      out.push({ text: m[4], kind: 'number' });
    } else {
      out.push({ text: m[0], kind: 'punctuation' });
    }
    last = index + m[0].length;
  }
  if (last < line.length) {
    out.push({ text: line.slice(last) });
  }
  return out;
}

const YAML_KEY = /^(\s*(?:-\s+)?)([^:#\s][^:#]*?)(:)(\s|$)/;

function tokenizeYaml(line: string): Token[] {
  const comment = line.match(/(^|\s)(#.*)$/);
  const code = comment ? line.slice(0, comment.index! + comment[1].length) : line;
  const out: Token[] = [];
  let rest = code;
  const key = rest.match(YAML_KEY);
  if (key) {
    out.push(
      { text: key[1], kind: 'punctuation' },
      { text: key[2], kind: 'property' },
      { text: key[3], kind: 'punctuation' }
    );
    rest = rest.slice(key[1].length + key[2].length + key[3].length);
  } else {
    const dash = rest.match(/^(\s*-\s+)/);
    if (dash) {
      out.push({ text: dash[1], kind: 'punctuation' });
      rest = rest.slice(dash[1].length);
    }
  }
  const value = rest.trim();
  if (/^(true|false|null|~)$/.test(value)) {
    out.push({ text: rest, kind: 'literal' });
  } else if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) {
    out.push({ text: rest, kind: 'number' });
  } else if (value) {
    out.push({ text: rest, kind: 'string' });
  } else if (rest) {
    out.push({ text: rest });
  }
  if (comment) {
    out.push({ text: comment[2], kind: 'comment' });
  }
  return out;
}

const renderToken = (t: Token, key: number) => {
  if (!t.kind) {
    return t.text;
  }
  return (
    <span key={key} className={`tok-${t.kind}`}>
      {t.text}
    </span>
  );
};

export const CodeBlock = ({
  value,
  language = 'text',
  lineNumbers = true,
  wrap = false,
  placeholder = '',
  className = '',
  style,
}: {
  value: string;
  language?: Language;
  lineNumbers?: boolean;
  wrap?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const lines = useMemo(() => {
    const text = value || '';
    const plain = (l: string): Token[] => [{ text: l }];
    const tokenizers: Record<Language, (l: string) => Token[]> = {
      json: tokenizeJson,
      yaml: tokenizeYaml,
      text: plain,
    };
    const tokenize = tokenizers[language] ?? plain;
    return text.split('\n').map(tokenize);
  }, [value, language]);

  const classes = ['nd-code-block', lineNumbers ? 'with-lines' : '', wrap ? 'is-wrapped' : '', className].join(' ');
  return (
    <div className={classes} style={style}>
      {value ? (
        <pre>
          <code>
            {lines.map((tokens, i) => (
              <span className='line' key={i}>
                {tokens.map(renderToken)}
                {'\n'}
              </span>
            ))}
          </code>
        </pre>
      ) : (
        <div className='nd-code-placeholder'>{placeholder}</div>
      )}
    </div>
  );
};

export default CodeBlock;
