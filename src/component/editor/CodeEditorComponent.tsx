import React from 'react';
import { useSelector } from 'react-redux';
import { CypherEditor, CypherEditorProps } from '@neo4j-cypher/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
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

/**
 * Cypher (or Markdown) editor. Colours come from the --nd-code-* tokens in both appearances
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
}: {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  editable?: boolean;
  language?: string;
  onExecute?: () => void;
  style?: React.CSSProperties;
  className?: string;
}) => {
  const [keys, setKeys] = React.useState({});
  const theme = useSelector(getDashboardTheme);

  const editorProps: CypherEditorProps = {
    cypherLanguage: language === 'cypher',
    readOnly: !editable,
    placeholder: placeholder,
    preExtensions: language === 'markdown' ? markdownExtensions : [],
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
