import React, { useEffect, useMemo, useState } from 'react';
import { connect } from 'react-redux';
import { LoadingSpinner, TextInput, Typography, FilledButton, OutlinedButton } from '@neo4j-ndl/react';
import { Dialog } from '../../component/dialog/Dialog';
import { ClockIconOutline, MagnifyingGlassIconOutline, PlusIconOutline } from '@neo4j-ndl/react/icons';
import { api, DashboardSummary, isEditor } from '../../api/client';
import { applyUrlStateThunk } from '../../application/UrlState';
import { setDraft, setHomeOpen } from '../../application/ApplicationActions';
import { setDashboard } from '../DashboardActions';
import { emptyDashboardState } from '../DashboardReducer';
import { createUUID } from '../../utils/uuid';

type Sort = 'title' | 'updated';

const relativeTime = (iso: string | null) => {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const seconds = (date.getTime() - Date.now()) / 1000;
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }
  return 'just now';
};

/**
 * The start page: every dashboard the user can open, with search and sorting. Editors can also
 * start a new dashboard or go back to one they have unsaved changes in.
 */
export const DashboardSelector = ({ current, draft, openDashboard, continueEditing, createDashboard }) => {
  const [dashboards, setDashboards] = useState<DashboardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('title');
  // An action waiting for the user to confirm discarding unsaved changes.
  const [pending, setPending] = useState<null | { label: string; run: () => void }>(null);
  const editor = isEditor();
  const unsaved = editor && draft && current?.uuid;

  useEffect(() => {
    api
      .listDashboards()
      .then(setDashboards)
      .catch((e) => setError(e?.message ?? String(e)));
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (dashboards ?? []).filter(
      (d) => !term || d.title?.toLowerCase().includes(term) || d.author?.toLowerCase().includes(term)
    );
    const byTitle = (a: DashboardSummary, b: DashboardSummary) =>
      (a.title ?? '').localeCompare(b.title ?? '', undefined, { sensitivity: 'base' });
    const byUpdated = (a: DashboardSummary, b: DashboardSummary) =>
      String(b.date ?? '').localeCompare(String(a.date ?? ''));
    return list.sort(sort === 'title' ? byTitle : byUpdated);
  }, [dashboards, search, sort]);

  // Leaving unsaved changes needs confirmation.
  const guard = (label: string, run: () => void) => (unsaved ? setPending({ label, run }) : run());

  const open = (d: DashboardSummary) => (event: React.MouseEvent) => {
    // Let the browser handle new-tab / new-window clicks on the link.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    if (unsaved && d.uuid === current?.uuid) {
      continueEditing();
      return;
    }
    guard(`open “${d.title}”`, () => openDashboard(d.uuid));
  };

  return (
    <main className='selector'>
      <div className='selector-inner'>
        <div className='selector-head'>
          <div>
            <Typography variant='title-1' as='h1'>
              Dashboards
            </Typography>
            <Typography variant='body-medium' as='p' className='selector-muted'>
              {dashboards ? `${dashboards.length} dashboard${dashboards.length === 1 ? '' : 's'}` : ' '}
            </Typography>
          </div>
          {editor ? (
            <FilledButton
              onClick={() => guard('start a new dashboard', createDashboard)}
              leadingVisual={<PlusIconOutline className='n-w-5 n-h-5' />}
            >
              New dashboard
            </FilledButton>
          ) : (
            <></>
          )}
        </div>

        <div className='selector-tools'>
          <div className='selector-search'>
            <TextInput
              placeholder='Search by name or author'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leadingElement={<MagnifyingGlassIconOutline />}
              isFluid
              htmlAttributes={{ 'aria-label': 'Search dashboards' }}
            />
          </div>
          <div className='selector-sort' role='group' aria-label='Sort'>
            {(['title', 'updated'] as Sort[]).map((s) => (
              <button
                key={s}
                type='button'
                aria-pressed={sort === s}
                className={sort === s ? 'is-active' : ''}
                onClick={() => setSort(s)}
              >
                {s === 'title' ? 'Name' : 'Recently updated'}
              </button>
            ))}
          </div>
        </div>

        {unsaved ? (
          <button type='button' className='selector-draft' onClick={continueEditing}>
            <span className='selector-draft-dot' aria-hidden />
            <span>
              Continue editing <b>{current.title || 'Untitled dashboard'}</b> — unsaved changes
            </span>
          </button>
        ) : (
          <></>
        )}

        {error ? (
          <div className='selector-empty' role='alert'>
            Could not load dashboards: {error}
          </div>
        ) : !dashboards ? (
          <div className='selector-empty'>
            <LoadingSpinner size='large' />
          </div>
        ) : visible.length === 0 ? (
          <div className='selector-empty'>
            {dashboards.length === 0
              ? editor
                ? 'No dashboards yet. Create the first one.'
                : 'No dashboards yet. Ask an editor to create one.'
              : `No dashboards match “${search}”.`}
          </div>
        ) : (
          <ul className='selector-grid'>
            {visible.map((d) => (
              <li key={d.uuid}>
                <a className='selector-card' href={`/dashboards/${encodeURIComponent(d.uuid)}`} onClick={open(d)}>
                  <span className='selector-card-title'>{d.title || 'Untitled dashboard'}</span>
                  <span className='selector-card-meta'>
                    <ClockIconOutline className='n-w-4 n-h-4' aria-hidden />
                    {relativeTime(d.date) || 'Unknown date'}
                    {d.author ? ` · ${d.author}` : ''}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog isOpen={Boolean(pending)} onClose={() => setPending(null)} size='small'>
        <Dialog.Header>Discard unsaved changes?</Dialog.Header>
        <Dialog.Content>
          “{current?.title || 'Untitled dashboard'}” has changes that have not been saved. If you {pending?.label}, they
          will be lost.
        </Dialog.Content>
        <Dialog.Actions>
          <OutlinedButton onClick={() => setPending(null)} variant='neutral'>
            Keep editing
          </OutlinedButton>
          <FilledButton
            onClick={() => {
              const action = pending;
              setPending(null);
              action?.run();
            }}
            variant='danger'
          >
            Discard changes
          </FilledButton>
        </Dialog.Actions>
      </Dialog>
    </main>
  );
};

const mapStateToProps = (state) => ({
  current: state.dashboard,
  draft: state.application.draft,
});

const mapDispatchToProps = (dispatch) => ({
  openDashboard: (uuid: string) => dispatch(applyUrlStateThunk({ uuid, parameters: {} }, { fresh: true })),
  continueEditing: () => dispatch(setHomeOpen(false)),
  createDashboard: () => {
    dispatch(setDashboard({ ...emptyDashboardState, uuid: createUUID() }));
    dispatch(setDraft(true));
    dispatch(setHomeOpen(false));
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(DashboardSelector);
