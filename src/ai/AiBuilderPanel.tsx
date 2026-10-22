import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { CleanIconButton, FilledButton, Skeleton, TextArea, toast } from '@neo4j-ndl/react';
import {
  ArrowLeftIconOutline,
  ChartBarIconOutline,
  ChartPieIconOutline,
  CodeBracketIconOutline,
  DocumentTextIconOutline,
  HashtagIconOutline,
  MapIconOutline,
  PresentationChartLineIconOutline,
  ShareIconOutline,
  SparklesIconOutline,
  TableCellsIconOutline,
} from '@neo4j-ndl/react/icons';
import { api, ApiError, type AiReport } from '../api/client';
import { getDashboardExtensions } from '../dashboard/DashboardSelectors';
import { getDatabase, getPageNumber } from '../settings/SettingsSelectors';
import { buildCatalogue } from './catalogue';
import { buildContext } from './context';
import { applyAiReportThunk, restoreReportThunk } from './AiThunks';

/** How long after typing stops the suggestions follow the description. */
const SUGGEST_DELAY_MS = 800;

const TYPE_ICONS: Record<string, React.ReactNode> = {
  bar: <ChartBarIconOutline />,
  line: <PresentationChartLineIconOutline />,
  pie: <ChartPieIconOutline />,
  table: <TableCellsIconOutline />,
  json: <CodeBracketIconOutline />,
  text: <DocumentTextIconOutline />,
  value: <HashtagIconOutline />,
  map: <MapIconOutline />,
  graph: <ShareIconOutline />,
};

/** What went wrong, for the panel: the server's message and the problems that stopped the build. */
const describeError = (e: any): { message: string; problems: string[] } => {
  if (e instanceof ApiError) {
    const problems = (e.details?.problems ?? []).map((p) => `${p.path ? `${p.path}: ` : ''}${p.message}`);
    return { message: e.message, problems: problems.slice(0, 4) };
  }
  return { message: e?.message ?? String(e), problems: [] };
};

/**
 * Build with AI, inside a report: describe the report, or pick one of up to three suggestions (from
 * the database, the dashboard and what has been typed so far). The report is built and checked on
 * the server, then applied here; it stays unsaved until Save, and the toast that confirms it offers
 * Undo.
 */
export const AiBuilderPanel = ({ reportId, onClose }: { reportId: string; onClose: () => void }) => {
  const dispatch = useDispatch<any>();
  const store = useStore();
  const extensions = useSelector(getDashboardExtensions);
  const catalogue = useMemo(() => buildCatalogue(extensions ?? {}), [extensions]);
  const [prompt, setPrompt] = useState('');
  const [suggestions, setSuggestions] = useState<AiReport[] | undefined>(undefined);
  const [suggestionsFailed, setSuggestionsFailed] = useState(false);
  const [building, setBuilding] = useState<string | undefined>(undefined);
  const [error, setError] = useState<{ message: string; problems: string[] } | undefined>(undefined);
  const suggestRun = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
    suggestRun.current?.abort();
  }, []);

  const requestBase = () => {
    const state: any = store.getState();
    return {
      catalogue,
      context: buildContext(state, reportId),
      database: getDatabase(state, getPageNumber(state), reportId as any) || undefined,
    };
  };

  // Suggestions: when the panel opens, then whenever typing pauses. A newer request replaces an older
  // one; while the server is still answering an older one ("busy"), try again shortly.
  useEffect(() => {
    const timer = setTimeout(
      async () => {
        suggestRun.current?.abort();
        const run = new AbortController();
        suggestRun.current = run;
        setSuggestions(undefined);
        setSuggestionsFailed(false);
        for (let tries = 0; tries < 20 && !run.signal.aborted; tries++) {
          try {
            const { suggestions: found } = await api.aiSuggest({ prompt, ...requestBase() }, run.signal);
            if (!run.signal.aborted) {
              setSuggestions(found);
            }
            return;
          } catch (e: any) {
            if (run.signal.aborted || e?.name === 'AbortError') {
              return;
            }
            if (e instanceof ApiError && e.code === 'busy') {
              await new Promise((resolve) => setTimeout(resolve, 1000));
              continue;
            }
            setSuggestions([]);
            setSuggestionsFailed(true);
            return;
          }
        }
      },
      prompt ? SUGGEST_DELAY_MS : 0
    );
    return () => clearTimeout(timer);
  }, [prompt]);

  const build = async (suggestion?: AiReport) => {
    setBuilding(suggestion ? suggestion.title : 'prompt');
    setError(undefined);
    try {
      let result;
      for (let tries = 0; ; tries++) {
        try {
          result = await api.aiBuild({ prompt: suggestion ? '' : prompt, suggestion, ...requestBase() });
          break;
        } catch (e) {
          if (e instanceof ApiError && e.code === 'busy' && tries < 30) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }
          throw e;
        }
      }
      // Close first: applying the report replaces this panel with the report (and Undo should bring
      // back the empty report, not the panel).
      onClose();
      const snapshot = dispatch(applyAiReportThunk(reportId, result.report));
      toast.neutral(
        result.warnings.length
          ? `Built "${result.report.title}". Note: ${result.warnings[0]}`
          : `Built "${result.report.title}".`,
        {
          actionLabel: 'Undo',
          onAction: () => dispatch(restoreReportThunk(reportId, snapshot)),
          shouldCloseOnAction: true,
          isCloseable: true,
        }
      );
    } catch (e) {
      if (mounted.current) {
        setError(describeError(e));
      }
    } finally {
      if (mounted.current) {
        setBuilding(undefined);
      }
    }
  };

  const labelOf = (type: string) => catalogue.types.find((t) => t.key === type)?.label ?? type;

  return (
    <div className='nd-ai-panel' role='region' aria-label='Build with AI'>
      <div className='nd-ai-head'>
        <CleanIconButton description='Back' size='small' onClick={onClose}>
          <ArrowLeftIconOutline />
        </CleanIconButton>
        <SparklesIconOutline className='nd-ai-head-icon' aria-hidden />
        <span>Build with AI</span>
      </div>
      <TextArea
        label='Describe the report'
        value={prompt}
        isFluid
        size='small'
        placeholder='e.g. Revenue per month as a line, or top 10 products as horizontal bars'
        isDisabled={Boolean(building)}
        htmlAttributes={{
          autoFocus: true,
          rows: 2,
          onChange: (event) => setPrompt(event.target.value),
          onKeyDown: (event) => {
            // Ctrl/Cmd+Enter builds.
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && prompt.trim() && !building) {
              event.preventDefault();
              void build();
            }
          },
        }}
      />
      <div className='nd-ai-actions'>
        <FilledButton
          size='small'
          isDisabled={!prompt.trim() || Boolean(building)}
          isLoading={building === 'prompt'}
          onClick={() => build()}
        >
          Build
        </FilledButton>
      </div>
      {error ? (
        <div className='nd-ai-error' role='alert'>
          <div>{error.message}</div>
          {error.problems.length ? (
            <ul>
              {error.problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          ) : (
            <></>
          )}
        </div>
      ) : (
        <></>
      )}
      <div className='nd-ai-suggestions' aria-busy={suggestions === undefined}>
        <div className='nd-ai-suggestions-title'>{prompt.trim() ? 'Suggestions for your description' : 'Suggestions'}</div>
        {suggestions === undefined ? (
          [0, 1, 2].map((i) => (
            <Skeleton key={i} className='nd-ai-suggestion-skeleton' shape='rectangular' height='44px' />
          ))
        ) : suggestions.length === 0 ? (
          <div className='nd-ai-suggestions-none'>
            {suggestionsFailed ? 'Suggestions are not available right now.' : 'No suggestions for this.'}
          </div>
        ) : (
          suggestions.map((s) => (
            <button
              key={`${s.title}:${s.query}`}
              type='button'
              className='nd-ai-suggestion'
              disabled={Boolean(building)}
              onClick={() => build(s)}
            >
              <span className='nd-ai-suggestion-icon' aria-hidden>
                {TYPE_ICONS[s.type] ?? <SparklesIconOutline />}
              </span>
              <span className='nd-ai-suggestion-text'>
                <span className='nd-ai-suggestion-title'>{s.title}</span>
                {s.why ? <span className='nd-ai-suggestion-why'>{s.why}</span> : <></>}
              </span>
              <span className='nd-ai-suggestion-type'>{building === s.title ? 'Building…' : labelOf(s.type)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default AiBuilderPanel;
