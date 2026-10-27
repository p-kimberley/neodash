import React from 'react';
import { useSelector } from 'react-redux';
import { CypherEditor, CypherEditorProps } from '@neo4j-cypher/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { Diagnostic, linter, lintGutter } from '@codemirror/lint';
import { tags } from '@lezer/highlight';
import { getDashboardTheme } from '../../dashboard/DashboardSelectors';

/** Helper text shown under a query editor (e.g. what fields a chart expects). */
export const DEFAULT_CARD_SETTINGS_HELPER_TEXT_STYLE = {
  color: 'var(--nd-text-muted)',
  fontSize: 'var(--nd-text-xs)',
  lineHeight: 1.5,
  padding: '6px 2px 0',
  marginTop: '0px',
};

const markdownExtensions = [
  markdown({
    base: markdownLanguage, // Support GFM
    // codeLanguages: languages
  }),
];

const parseJson = jsonParseLinter();

/**
 * Marks where the JSON stops parsing. The parser names one position; the mark covers the character
 * there, so it shows as an underline. An empty document isn't marked: there is nothing to fix yet.
 */
const jsonSyntaxErrors = (view: EditorView): Diagnostic[] => {
  const { doc } = view.state;
  if (doc.toString().trim() === '') {
    return [];
  }
  return parseJson(view).map((d) => {
    const from = Math.max(0, Math.min(d.from, doc.length - 1));
    return { ...d, from, to: from + 1 };
  });
};

// JSON tokens get the classes the read-only code blocks use (.tok-* in src/theme/components.css).
const jsonExtensions = [
  json(),
  linter(jsonSyntaxErrors, { delay: 300 }),
  lintGutter(),
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: tags.propertyName, class: 'tok-property' },
      { tag: tags.string, class: 'tok-string' },
      { tag: tags.number, class: 'tok-number' },
      { tag: [tags.bool, tags.null], class: 'tok-literal' },
      { tag: [tags.separator, tags.brace, tags.squareBracket], class: 'tok-punctuation' },
    ])
  ),
];

const LANGUAGE_EXTENSIONS = { markdown: markdownExtensions, json: jsonExtensions };

/**
 * Cypher (or Markdown, or JSON) editor. Colours come from the --nd-code-* tokens in both appearances
 * (see .nd-code-editor in src/theme/components.css).
 */
const NeoCodeEditorComponent = ({
  value,
  onChange,
  placeholder,
  editable = true,
  language = 'cypher',
  onExecute = () => {},
  style = {},
  className = '',
  ariaLabel,
}: {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  language?: string;
  onExecute?: () => void;
  style?: React.CSSProperties;
  className?: string;
  ariaLabel?: string;
}) => {
  const [keys, setKeys] = React.useState({});
  const theme = useSelector(getDashboardTheme);

  const editorProps: CypherEditorProps = {
    cypherLanguage: language === 'cypher',
    readOnly: !editable,
    placeholder: placeholder,
    preExtensions: LANGUAGE_EXTENSIONS[language] ?? [],
    postExtensions: ariaLabel ? [EditorView.contentAttributes.of({ 'aria-label': ariaLabel })] : [],
    // The default shows a one-line document's number as a "$" prompt; JSON numbers every line.
    ...(language === 'json' ? { lineNumberFormatter: (line: number) => `${line}` } : {}),
    value: value,
    theme: theme,

    // This is a check to discover whether a user wants to run the report with a shortcut (CTRL/CMD + Enter)
    onKeyDown: (e) => {
      const newKeys = keys;
      newKeys[e.key] = true;
      setKeys(newKeys);
      if ((newKeys.Control && newKeys.Enter) || (newKeys.Meta && newKeys.Enter)) {
        onExecute();
        setKeys({});
      }
      return undefined;
    },
    onKeyUp: (e) => {
      const newKeys = keys;
      delete newKeys[e.key];
      setKeys(newKeys);
      return undefined;
    },
    onValueChanged: (val) => {
      if (editable && onChange) {
        onChange(val);
      }
    },
  };

  // className 'ReactCodeMirror', only used by integration tests
  return (
    <div className={`nd-code-editor ${editable ? '' : 'is-readonly'} ${className}`} style={style}>
      <CypherEditor className='ndl-cypher-editor ReactCodeMirror' {...editorProps} />
    </div>
  );
};

export default NeoCodeEditorComponent;
