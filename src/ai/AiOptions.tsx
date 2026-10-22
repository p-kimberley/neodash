import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { Skeleton, TextArea, toast } from '@neo4j-ndl/react';
import { api, ApiError, type AiReport } from '../api/client';
import { getDashboardExtensions } from '../dashboard/DashboardSelectors';
import { getDatabase, getPageNumber } from '../settings/SettingsSelectors';
import { buildCatalogue } from './catalogue';
import { buildContext } from './context';
import { applyAiReportThunk, restoreReportThunk } from './AiThunks';
import { MiniPreview } from './MiniPreview';

/** How long after typing stops the options are asked for. */
const TYPING_PAUSE_MS = 800;

/**
 * Build with AI's prompt and options. As the user types (and pauses), up to three options appear
 * below: complete reports, checked on the server, each with a small preview of its data, a plain
 * description of what it creates and of any settings it sets; the first is the recommended one. Picking
 * one applies it (unsaved until Save; the toast offers Undo).
 *
 * - "build": in an empty report. Options appear straight away (suggestions for the dashboard), then
 *   follow what is typed.
 * - "change": in a report's settings. Options change the report as described, once something is typed.
 */
export const AiOptions = ({
  reportId,
  mode,
  onApplied = () => {},
}: {
  reportId: string;
  mode: 'build' | 'change';
  onApplied?: () => void;
}) => {
  const dispatch = useDispatch<any>();
  const store = useStore();
  const extensions = useSelector(getDashboardExtensions);
  const catalogue = useMemo(() => buildCatalogue(extensions ?? {}), [extensions]);
  const [prompt, setPrompt] = useState('');
  // undefined: not asked yet; null: being worked out.
  const [options, setOptions] = useState<AiReport[] | null | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [asked, setAsked] = useState<{ prompt: string; at: number }>({ prompt: '', at: 0 });
  const run = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => run.current?.abort(), []);

  // Ask once typing pauses (straight away for Enter); in build mode also when the panel opens.
  useEffect(() => {
    const text = prompt.trim();
    if (mode === 'change' && !text) {
      run.current?.abort();
      setOptions(undefined);
      setError(undefined);
      return undefined;
    }
    // Options for an earlier text no longer fit: hold their place until the new ones arrive.
    if (text !== asked.prompt) {
      run.current?.abort();
      setOptions(null);
      setError(undefined);
    }
    const timer = setTimeout(() => setAsked({ prompt: text, at: Date.now() }), text ? TYPING_PAUSE_MS : 0);
    return () => clearTimeout(timer);
  }, [prompt]);

  useEffect(() => {
    if (!asked.at || (mode === 'change' && !asked.prompt)) {
      return;
    }
    run.current?.abort();
    const current = new AbortController();
    run.current = current;
    setOptions(null);
    setError(undefined);
    (async () => {
      for (let tries = 0; tries < 30 && !current.signal.aborted; tries++) {
        try {
          const state: any = store.getState();
          const { suggestions } = await api.aiSuggest(
            {
              prompt: asked.prompt,
              catalogue,
              context: buildContext(state, reportId),
              database: getDatabase(state, getPageNumber(state), reportId as any) || undefined,
            },
            current.signal
          );
          if (!current.signal.aborted) {
            setOptions(suggestions);
          }
          return;
        } catch (e: any) {
          if (current.signal.aborted || e?.name === 'AbortError') {
            return;
          }
          // The server is still working out an earlier request: ask again shortly.
          if (e instanceof ApiError && e.code === 'busy') {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }
          setOptions([]);
          setError(e?.message ?? String(e));
          return;
        }
      }
    })();
  }, [asked]);

  const apply = (option: AiReport) => {
    const snapshot = dispatch(applyAiReportThunk(reportId, option));
    toast.neutral(`${mode === 'build' ? 'Built' : 'Changed'}: ${option.title}.`, {
      actionLabel: 'Undo',
      onAction: () => dispatch(restoreReportThunk(reportId, snapshot)),
      shouldCloseOnAction: true,
      isCloseable: true,
    });
    setPrompt('');
    setOptions(undefined);
    onApplied();
  };

  const labelOf = (type: string) => catalogue.types.find((t) => t.key === type)?.label ?? type;

  return (
    <div className={`nd-ai-options nd-ai-options-${mode}`}>
      <TextArea
        label={mode === 'build' ? 'Describe the report' : 'Ask AI to change this report'}
        value={prompt}
        isFluid
        size='small'
        placeholder={
          mode === 'build'
            ? 'e.g. Revenue per month as a line, or top 10 products as horizontal bars'
            : 'e.g. horizontal bars with a legend, or show it as a table'
        }
        htmlAttributes={{
          // Opened on purpose (Build with AI, Change with AI): ready to type.
          autoFocus: true,
          rows: 2,
          onChange: (event) => setPrompt(event.target.value),
          onKeyDown: (event) => {
            // Enter asks straight away (Shift+Enter for a new line).
            if (event.key === 'Enter' && !event.shiftKey && prompt.trim()) {
              event.preventDefault();
              setAsked({ prompt: prompt.trim(), at: Date.now() });
            }
          },
        }}
      />
      {options === undefined ? (
        <></>
      ) : (
        <div className='nd-ai-option-list' aria-busy={options === null} aria-label='Options'>
          {options === null ? (
            // Where the options will appear, while they are worked out and checked.
            [0, 1, 2].map((i) => (
              <div key={i} className='nd-ai-option nd-ai-option-loading' role='presentation'>
                <Skeleton shape='rectangular' width='60px' height='60px' className='nd-ai-option-skeleton-preview' />
                <div className='nd-ai-option-text'>
                  <Skeleton shape='rectangular' height='12px' width='45%' />
                  <Skeleton shape='rectangular' height='10px' width='90%' />
                  <Skeleton shape='rectangular' height='10px' width='70%' />
                </div>
              </div>
            ))
          ) : error ? (
            <div className='nd-ai-error' role='alert'>
              {error}
            </div>
          ) : options.length === 0 ? (
            <div className='nd-ai-suggestions-none'>No options for this; try describing it differently.</div>
          ) : (
            options.map((option, index) => (
              <button
                key={`${index}:${option.title}:${option.query}`}
                type='button'
                className='nd-ai-option'
                onClick={() => apply(option)}
              >
                <MiniPreview option={option} />
                <span className='nd-ai-option-text'>
                  <span className='nd-ai-option-title'>
                    <span className='nd-ai-option-title-text'>{option.title}</span>
                    {index === 0 ? <span className='nd-ai-option-recommended'>Recommended</span> : <></>}
                    <span className='nd-ai-option-type'>{labelOf(option.type)}</span>
                  </span>
                  <span className='nd-ai-option-description'>{option.description ?? option.why}</span>
                  {option.settingsNote ? <span className='nd-ai-option-note'>{option.settingsNote}</span> : <></>}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default AiOptions;
