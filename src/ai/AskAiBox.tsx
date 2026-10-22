import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { OutlinedButton, TextInput, toast } from '@neo4j-ndl/react';
import { SparklesIconOutline } from '@neo4j-ndl/react/icons';
import { api, ApiError } from '../api/client';
import { getDashboardExtensions } from '../dashboard/DashboardSelectors';
import { getDatabase, getPageNumber } from '../settings/SettingsSelectors';
import { buildCatalogue } from './catalogue';
import { buildContext } from './context';
import { applyAiReportThunk, restoreReportThunk } from './AiThunks';

/**
 * Ask AI, in a report's settings: describe a change to the whole report ("horizontal stacked bars by
 * region", "add a legend", "show it as a table") and Build with AI changes its type, query, fields and
 * settings as asked, checked on the server first. The query-only English editor sits below it.
 */
export const AskAiBox = ({ reportId }: { reportId: string }) => {
  const dispatch = useDispatch<any>();
  const store = useStore();
  const extensions = useSelector(getDashboardExtensions);
  const catalogue = useMemo(() => buildCatalogue(extensions ?? {}), [extensions]);
  const [prompt, setPrompt] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const ask = async () => {
    const state: any = store.getState();
    setRunning(true);
    setError(undefined);
    try {
      let result;
      for (let tries = 0; ; tries++) {
        try {
          result = await api.aiBuild({
            prompt,
            catalogue,
            context: buildContext(state, reportId),
            database: getDatabase(state, getPageNumber(state), reportId as any) || undefined,
          });
          break;
        } catch (e) {
          if (e instanceof ApiError && e.code === 'busy' && tries < 30) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            continue;
          }
          throw e;
        }
      }
      const snapshot = dispatch(applyAiReportThunk(reportId, result.report));
      setPrompt('');
      toast.neutral(`Changed the report: ${result.report.title}.`, {
        actionLabel: 'Undo',
        onAction: () => dispatch(restoreReportThunk(reportId, snapshot)),
        shouldCloseOnAction: true,
        isCloseable: true,
      });
    } catch (e: any) {
      const problems: string[] = (e instanceof ApiError ? (e.details?.problems ?? []) : []).map((p) => p.message);
      setError([e?.message ?? String(e), ...problems.slice(0, 2)].join(' '));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className='nd-ask-ai'>
      <TextInput
        isFluid
        size='small'
        value={prompt}
        placeholder='Ask AI to change this report, e.g. "horizontal bars with a legend"'
        isDisabled={running}
        errorText={error}
        leadingElement={<SparklesIconOutline />}
        onChange={(e) => setPrompt(e.target.value)}
        htmlAttributes={{
          'aria-label': 'Ask AI',
          onKeyDown: (e) => {
            if (e.key === 'Enter' && prompt.trim() && !running) {
              e.preventDefault();
              void ask();
            }
          },
        }}
      />
      <OutlinedButton size='small' isDisabled={!prompt.trim() || running} isLoading={running} onClick={() => ask()}>
        Apply
      </OutlinedButton>
    </div>
  );
};

export default AskAiBox;
