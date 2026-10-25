import React from 'react';
import { ChartProps } from '../Chart';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import URI from 'urijs';
import { replaceDashboardParameters } from '../ChartUtils';
import { fillQueryPlaceholders } from './MarkdownQuery';

// Sanitizes URIs
const transformUri = (uri: string): string | undefined => {
  const parsedUri = URI(uri);
  if (parsedUri.protocol() === 'http' || parsedUri.protocol() === 'https') {
    return parsedUri.toString(); // Convert URI object back to string
  }
  return undefined; // Return undefined to skip rendering of potentially unsafe URLs
};

// Define custom components for Markdown elements
// react-markdown passes each element's syntax-tree `node`; it must not end up on the DOM element.
const CustomTable = ({ node: _node, ...props }: any) => <table {...props} className='markdown-table' />;
const CustomTh = ({ node: _node, ...props }: any) => <th {...props} className='markdown-th' />;
const CustomTd = ({ node: _node, ...props }: any) => <td {...props} className='markdown-td' />;
const CustomATag = ({ node: _node, href, ...props }: any) => (
  // Apply URI transformation right in the anchor element for additional security
  <a href={href ? transformUri(href) : undefined} {...props} rel='noopener noreferrer' target='_blank' />
);

/**
 * Renders Markdown text provided by the user.
 */
const NeoMarkdownChart = (props: ChartProps) => {
  // Define custom components for Markdown elements
  const components = {
    table: CustomTable,
    th: CustomTh,
    td: CustomTd,
    a: CustomATag,
  };

  // Records are overridden to be a single element array with a field called 'input' (the Markdown), and
  // 'rows' (the Cypher query's result) when the report has a query.
  const { records } = props;
  const parameters = props.parameters ? props.parameters : {};
  const replaceGlobalParameters =
    props.settings && props.settings.replaceGlobalParameters !== undefined
      ? props.settings.replaceGlobalParameters
      : true;
  const { input: markdown, rows } = records[0] as any;
  const withParameters = replaceGlobalParameters ? replaceDashboardParameters(markdown, parameters) : markdown;
  const modifiedMarkdown = rows ? fillQueryPlaceholders(withParameters, rows) : withParameters;
  return (
    <div
      className='markdown-widget'
      style={{ marginTop: '0px', marginLeft: '15px', marginRight: '15px', marginBottom: '0px' }}
    >
      {/* Links open in a new tab via CustomATag; a <base target> tag here retargeted every link on the page. */}
      <ReactMarkdown
        children={modifiedMarkdown}
        remarkPlugins={[remarkGfm]}
        components={components}
        // Links: http(s) only, as before; other URLs (images) get react-markdown's default safe handling.
        urlTransform={(url, key) => (key === 'href' ? (transformUri(url) ?? '') : defaultUrlTransform(url))}
      />
    </div>
  );
};

export default NeoMarkdownChart;
