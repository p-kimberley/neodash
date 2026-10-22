import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { CleanIconButton, Skeleton, TextArea, toast } from '@neo4j-ndl/react';
import { SparklesIconOutline, StopIconOutline } from '@neo4j-ndl/react/icons';
import { api, ApiError, type AiReport } from '../api/client';
import { getDashboardExtensions } from '../dashboard/DashboardSelectors';
import { getDatabase, getPageNumber } from '../settings/SettingsSelectors';
import { buildCatalogue } from './catalogue';
import { buildContext } from './context';
import { applyAiReportThunk, restoreReportThunk } from './AiThunks';
import { MiniPreview } from './MiniPreview';

/** The prompt box grows with its text up to this height, then scrolls. */
const PROMPT_MAX_HEIGHT = 140;

/**
 * Build with AI's prompt and options. When the user asks (the sparkles button in the box, or Enter),
 * up to three options appear below: complete reports, checked on the server, each with a small preview
 * of its data, a plain description of what it creates and of any settings it sets; the first is the
 * recommended one. Typing alone asks for nothing. Picking one applies it (unsaved until Save; the toast
 * offers Undo). While options are worked out a halo circles the box, and the button becomes Stop (as
 * does Escape), which brings back the options shown before.
 *
 * - "build": in an empty report. Options appear straight away (suggestions for the dashboard), then
 *   for what is described.
 * - "change": in a report's settings. Options change the report as described.
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
  const [asking, setAsking] = useState(false);
  // What the last finished request showed: Stop goes back to it.
  const settled = useRef<{ options: AiReport[] | undefined; error: string | undefined }>({
    options: undefined,
    error: undefined,
  });
  const run = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => run.current?.abort(), []);

  // One line to start with, growing as the text wraps or gets new lines (Shift+Enter).
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) {
      return;
    }
    el.style.height = 'auto';
    const borders = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + borders, PROMPT_MAX_HEIGHT)}px`;
  }, [prompt]);

  // In build mode, suggestions for the dashboard when the panel opens.
  useEffect(() => {
    if (mode === 'build') {
      setAsked({ prompt: '', at: Date.now() });
    }
  }, []);

  /** Asks for options for what is typed (the sparkles button, or Enter). */
  const ask = () => {
    const text = prompt.trim();
    if (text || mode === 'build') {
      setAsked({ prompt: text, at: Date.now() });
    }
  };

  /** Stops the request in progress (the server stops too), bringing back what was shown before. */
  const stop = () => {
    run.current?.abort();
    run.current = undefined;
    setAsking(false);
    setOptions(settled.current.options);
    setError(settled.current.error);
  };

  const settle = (shown: AiReport[], message?: string) => {
    settled.current = { options: shown, error: message };
    setOptions(shown);
    setError(message);
  };

  useEffect(() => {
    if (!asked.at || (mode === 'change' && !asked.prompt)) {
      return;
    }
    run.current?.abort();
    const current = new AbortController();
    run.current = current;
    setOptions(null);
    setError(undefined);
    setAsking(true);
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
            settle(suggestions);
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
          settle([], e?.message ?? String(e));
          return;
        }
      }
    })().finally(() => {
      if (run.current === current) {
        setAsking(false);
      }
    });
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
    settled.current = { options: undefined, error: undefined };
    setOptions(undefined);
    onApplied();
  };

  const labelOf = (type: string) => catalogue.types.find((t) => t.key === type)?.label ?? type;

  return (
    <div className={`nd-ai-options nd-ai-options-${mode}`}>
      <div className={`nd-ai-prompt${asking ? ' is-asking' : ''}`}>
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
          ref={box}
          htmlAttributes={{
            // Opened on purpose (Build with AI, Change with AI): ready to type.
            autoFocus: true,
            rows: 1,
            onChange: (event) => setPrompt(event.target.value),
            onKeyDown: (event) => {
              // Enter asks (Shift+Enter for a new line); Escape stops a request in progress.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                ask();
              } else if (event.key === 'Escape' && asking) {
                event.preventDefault();
                event.stopPropagation();
                stop();
              }
            },
          }}
        />
        {asking ? (
          <CleanIconButton description='Stop' size='small' className='nd-ai-prompt-ask' onClick={stop}>
            <StopIconOutline />
          </CleanIconButton>
        ) : (
          <CleanIconButton
            description='Suggest options'
            size='small'
            className='nd-ai-prompt-ask'
            isDisabled={!prompt.trim() && mode === 'change'}
            onClick={ask}
          >
            <SparklesIconOutline />
          </CleanIconButton>
        )}
      </div>
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
