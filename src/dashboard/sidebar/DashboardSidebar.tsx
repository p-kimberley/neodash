import React, { useContext, useEffect, useState } from 'react';
import { connect } from 'react-redux';
import { getDashboardIsEditable, getPageNumber } from '../../settings/SettingsSelectors';
import { getDashboardSettings, getDashboardTitle } from '../DashboardSelectors';
import { TextInput, CleanIconButton } from '@neo4j-ndl/react';
import { removeReportThunk } from '../../page/PageThunks';
import {
  PlusIconOutline,
  MagnifyingGlassIconOutline,
  CircleStackIconOutline,
  ArrowPathIconOutline,
} from '@neo4j-ndl/react/icons';

import { DashboardSidebarListItem } from './DashboardSidebarListItem';
import {
  applicationGetConnection,
  applicationGetConnectionDatabase,
  applicationGetStandaloneSettings,
  applicationIsStandalone,
  dashboardIsDraft,
} from '../../application/ApplicationSelectors';
import { setDraft, setSidebarOpen } from '../../application/ApplicationActions';
import { applicationIsSidebarOpen } from '../../application/ApplicationSelectors';
import NeoDashboardSidebarLoadModal from './modal/DashboardSidebarLoadModal';
import { resetDashboardState } from '../DashboardActions';
import NeoDashboardSidebarCreateModal from './modal/DashboardSidebarCreateModal';
import NeoDashboardSidebarDatabaseMenu from './menu/DashboardSidebarDatabaseMenu';
import NeoDashboardSidebarDashboardMenu from './menu/DashboardSidebarDashboardMenu';
import {
  deleteDashboardFromNeo4jThunk,
  loadDashboardFromNeo4jThunk,
  loadDashboardListFromNeo4jThunk,
  loadDashboardThunk,
  loadDatabaseListFromNeo4jThunk,
  saveDashboardToNeo4jThunk,
} from '../DashboardThunks';
import { Neo4jContext, Neo4jContextState } from '../../api/Neo4jContext';
import NeoDashboardSidebarSaveModal from './modal/DashboardSidebarSaveModal';
import { getDashboardJson } from '../../modal/ModalSelectors';
import NeoDashboardSidebarCreateMenu from './menu/DashboardSidebarCreateMenu';
import NeoDashboardSidebarImportModal from './modal/DashboardSidebarImportModal';
import { createUUID } from '../../utils/uuid';
import NeoDashboardSidebarExportModal from './modal/DashboardSidebarExportModal';
import NeoDashboardSidebarEditJsonModal from './modal/DashboardSidebarEditJsonModal';
import { withDashboardUuid } from './modal/DashboardJson';
import NeoDashboardSidebarDeleteModal from './modal/DashboardSidebarDeleteModal';
import NeoDashboardSidebarInfoModal from './modal/DashboardSidebarInfoModal';
import NeoDashboardSidebarShareModal from './modal/DashboardSidebarShareModal';
import { NEODASH_VERSION } from '../DashboardReducer';

// Which (small) pop-up menu is currently open for the sidebar.
enum Menu {
  DASHBOARD = 0,
  DATABASE = 1,
  CREATE = 2,
  NONE = 3,
}

// Which (large) pop-up modal is currently open for the sidebar.
enum Modal {
  CREATE = 0,
  IMPORT = 1,
  EXPORT = 2,
  DELETE = 3,
  SHARE = 4,
  EDIT_JSON = 5,
  INFO = 6,
  LOAD = 7,
  SAVE = 8,
  NONE = 9,
}

// We use "index = -1" to represent a non-saved draft dashboard in the sidebar's dashboard list.
const UNSAVED_DASHBOARD_INDEX = -1;
// Matches the slide transition of .nd-dashboard-panel (components.css).
const SIDEBAR_TRANSITION_MS = 220;

/**
 * A component responsible for rendering the sidebar on the left of the screen.
 */
export const NeoDashboardSidebar = ({
  database,
  connection,
  title,
  readonly,
  draft,
  setDraft,
  dashboard,
  resetLocalDashboard,
  loadDashboard,
  loadDatabaseListFromNeo4j,
  loadDashboardListFromNeo4j,
  loadDashboardFromNeo4j,
  saveDashboardToNeo4j,
  deleteDashboardFromNeo4j,
  standaloneSettings,
  expanded,
  closePanel,
}) => {
  const { driver } = useContext<Neo4jContextState>(Neo4jContext);
  const [selectedDashboardIndex, setSelectedDashboardIndex] = React.useState(UNSAVED_DASHBOARD_INDEX);
  const [dashboardDatabase, setDashboardDatabase] = React.useState(database ? database : 'neo4j');
  const [databases, setDatabases] = useState([]);
  const [inspectedIndex, setInspectedIndex] = useState(UNSAVED_DASHBOARD_INDEX);
  const [searchText, setSearchText] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(Menu.NONE);
  const [modalOpen, setModalOpen] = useState(Modal.NONE);
  const [dashboards, setDashboards] = React.useState([]);
  const [listLoaded, setListLoaded] = React.useState(false);
  const [cachedDashboard, setCachedDashboard] = React.useState('');

  const getDashboardListFromNeo4j = () => {
    // Retrieves list of all dashboards stored in a given database.
    loadDashboardListFromNeo4j(driver, dashboardDatabase, (list) => {
      // Only re-render when the list actually changed, so a refresh doesn't disturb the panel.
      setDashboards((previous) => (JSON.stringify(previous) === JSON.stringify(list) ? previous : list));
      setListLoaded(true);

      // Update the UI to reflect the currently selected dashboard.
      if (dashboard && dashboard.uuid) {
        const index = list.findIndex((element) => element.uuid == dashboard.uuid);
        setSelectedDashboardIndex(index);
        if (index == UNSAVED_DASHBOARD_INDEX) {
          // If we can't find the currently dashboard in the database, we are drafting a new one.
          setDraft(true);
        }
      }
    });
  };

  // Load the list up front, so the panel already has its contents when it opens.
  useEffect(() => {
    getDashboardListFromNeo4j();
  }, []);

  // Refresh it when the panel opens, but only after the slide-in has finished: updating the list
  // mid-animation made the panel jump.
  useEffect(() => {
    if (!expanded) {
      return undefined;
    }
    const timer = setTimeout(getDashboardListFromNeo4j, SIDEBAR_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [expanded]);

  function createDashboard() {
    // Creates new dashboard in draft state (not yet saved to Neo4j)
    resetLocalDashboard();
    setDraft(true);
  }

  function deleteDashboard(uuid) {
    // Creates new dashboard in draft state (not yet saved to Neo4j)
    deleteDashboardFromNeo4j(driver, dashboardDatabase, uuid, () => {
      if (uuid == dashboard.uuid) {
        setSelectedDashboardIndex(UNSAVED_DASHBOARD_INDEX);
        resetLocalDashboard();
        loadDashboardListFromNeo4j();
        setDraft(true);
      }
      setTimeout(() => {
        getDashboardListFromNeo4j();
      }, 100);
    });
  }

  return (
    <div>
      <NeoDashboardSidebarSaveModal
        open={modalOpen == Modal.SAVE}
        onConfirm={() => {
          saveDashboardToNeo4j(
            driver,
            dashboardDatabase,
            dashboard,
            new Date().toISOString(),
            connection.username,
            () => {
              // After saving successfully, refresh the list after a small delay.
              // The new dashboard will always be on top (the latest), so we select index 0.
              setDashboards([]);
              setTimeout(() => {
                getDashboardListFromNeo4j();
                setSelectedDashboardIndex(0);
                setDraft(false);
              }, 100);
            }
          );
        }}
        overwrite={selectedDashboardIndex >= 0}
        handleClose={() => setModalOpen(Modal.NONE)}
      />

      <NeoDashboardSidebarLoadModal
        open={modalOpen == Modal.LOAD}
        onConfirm={() => {
          if (inspectedIndex == UNSAVED_DASHBOARD_INDEX) {
            // Someone attempted to load the unsaved draft dashboard... this isn't possible, we create a fresh one.
            setSelectedDashboardIndex(UNSAVED_DASHBOARD_INDEX);
            createDashboard();
          } else {
            // Load one of the dashboards from the database.
            setModalOpen(Modal.LOAD);
            closePanel();
            const { uuid } = dashboards[inspectedIndex];
            loadDashboardFromNeo4j(driver, dashboardDatabase, uuid, (file) => {
              setDraft(false);
              loadDashboard(uuid, file);
              setSelectedDashboardIndex(inspectedIndex);
            });
          }
        }}
        handleClose={() => setModalOpen(Modal.NONE)}
      />

      <NeoDashboardSidebarShareModal
        connection={connection}
        uuid={dashboards[inspectedIndex] && dashboards[inspectedIndex].uuid}
        dashboardDatabase={dashboardDatabase}
        open={modalOpen == Modal.SHARE}
        onConfirm={() => {
          setModalOpen(Modal.NONE);
        }}
        handleClose={() => setModalOpen(Modal.NONE)}
      />

      <NeoDashboardSidebarCreateModal
        open={modalOpen == Modal.CREATE}
        onConfirm={() => {
          setModalOpen(Modal.NONE);
          createDashboard();
          setSelectedDashboardIndex(UNSAVED_DASHBOARD_INDEX);
        }}
        handleClose={() => setModalOpen(Modal.NONE)}
      />

      <NeoDashboardSidebarDeleteModal
        open={modalOpen == Modal.DELETE}
        title={dashboards[inspectedIndex] && dashboards[inspectedIndex].title}
        onConfirm={() => {
          setModalOpen(Modal.NONE);
          if (dashboards[inspectedIndex]) {
            deleteDashboard(dashboards[inspectedIndex].uuid);
          }
        }}
        handleClose={() => setModalOpen(Modal.NONE)}
      />

      <NeoDashboardSidebarImportModal
        open={modalOpen == Modal.IMPORT}
        onImport={(text) => {
          setModalOpen(Modal.NONE);
          setDraft(true);
          setSelectedDashboardIndex(UNSAVED_DASHBOARD_INDEX);
          // Always a new dashboard: an exported file keeps its uuid, and saving must not overwrite that one.
          const uuid = createUUID();
          loadDashboard(uuid, withDashboardUuid(text, uuid));
        }}
        handleClose={() => setModalOpen(Modal.NONE)}
      />

      <NeoDashboardSidebarEditJsonModal
        open={modalOpen == Modal.EDIT_JSON}
        dashboard={cachedDashboard}
        discardsDraft={draft && selectedDashboardIndex != inspectedIndex}
        onApply={(text) => {
          // The edited JSON replaces the dashboard it came from: saving it overwrites that one.
          const editingOpen = draft && selectedDashboardIndex == inspectedIndex;
          const uuid = editingOpen ? (dashboard.uuid ?? createUUID()) : dashboards[inspectedIndex].uuid;
          setModalOpen(Modal.NONE);
          setCachedDashboard('');
          closePanel();
          loadDashboard(uuid, withDashboardUuid(text, uuid));
          setDraft(true);
          setSelectedDashboardIndex(inspectedIndex);
        }}
        handleClose={() => {
          setModalOpen(Modal.NONE);
          setCachedDashboard('');
        }}
      />

      <NeoDashboardSidebarInfoModal
        open={modalOpen == Modal.INFO}
        dashboard={dashboards[inspectedIndex]}
        handleClose={() => {
          setModalOpen(Modal.NONE);
          setCachedDashboard('');
        }}
      />

      <NeoDashboardSidebarExportModal
        open={modalOpen == Modal.EXPORT}
        dashboard={cachedDashboard}
        handleClose={() => {
          setModalOpen(Modal.NONE);
          setCachedDashboard('');
        }}
      />

      {/* The panel overlays the dashboard (see .dashboard-sidebar-slot), so the grid keeps its layout.
          The header's menu button opens and closes it (application state). */}
      <nav className={`nd-dashboard-panel ${expanded ? 'is-expanded' : ''}`} aria-label='Dashboards'>
        <div className='nd-dashboard-panel-content'>
          <div className='nd-dashboard-panel-section'>
            <NeoDashboardSidebarDatabaseMenu
              databases={databases}
              selected={dashboardDatabase}
              setSelected={(newDatabase) => {
                setDashboardDatabase(newDatabase);
                // We changed the active dashboard database, reload the list in the sidebar.
                loadDashboardListFromNeo4j(driver, newDatabase, (list) => {
                  setDashboards(list);
                  if (!readonly) {
                    setDraft(true);
                  }
                });
              }}
              open={menuOpen == Menu.DATABASE}
              anchorEl={menuAnchor}
              handleClose={() => {
                setMenuOpen(Menu.NONE);
                setMenuAnchor(null);
              }}
            />
            <NeoDashboardSidebarDashboardMenu
              draft={draft && selectedDashboardIndex == inspectedIndex}
              open={menuOpen == Menu.DASHBOARD}
              anchorEl={menuAnchor}
              handleInfoClicked={() => {
                setMenuOpen(Menu.NONE);
                const d = dashboards[inspectedIndex];
                loadDashboardFromNeo4j(driver, dashboardDatabase, d.uuid, (text) => {
                  setCachedDashboard(JSON.parse(text));
                });
                setModalOpen(Modal.INFO);
              }}
              handleDiscardClicked={() => {
                setMenuOpen(Menu.NONE);
                setModalOpen(Modal.LOAD);
              }}
              handleSaveClicked={() => {
                setMenuOpen(Menu.NONE);
                setModalOpen(Modal.SAVE);
              }}
              handleEditJsonClicked={() => {
                setMenuOpen(Menu.NONE);
                if (draft && selectedDashboardIndex == inspectedIndex) {
                  // The open dashboard's unsaved changes are what gets edited.
                  setCachedDashboard(dashboard);
                } else {
                  const d = dashboards[inspectedIndex];
                  loadDashboardFromNeo4j(driver, dashboardDatabase, d.uuid, (text) => {
                    setCachedDashboard(JSON.parse(text));
                  });
                }
                setModalOpen(Modal.EDIT_JSON);
              }}
              handleExportClicked={() => {
                setMenuOpen(Menu.NONE);
                const d = dashboards[inspectedIndex];
                loadDashboardFromNeo4j(driver, dashboardDatabase, d.uuid, (text) => {
                  setCachedDashboard(JSON.parse(text));
                });
                setModalOpen(Modal.EXPORT);
              }}
              handleShareClicked={() => {
                setMenuOpen(Menu.NONE);
                setModalOpen(Modal.SHARE);
              }}
              handleDeleteClicked={() => {
                setMenuOpen(Menu.NONE);
                setModalOpen(Modal.DELETE);
              }}
              handleClose={() => {
                setMenuOpen(Menu.NONE);
                setMenuAnchor(null);
              }}
            />

            <NeoDashboardSidebarCreateMenu
              open={menuOpen == Menu.CREATE}
              anchorEl={menuAnchor}
              handleNewClicked={() => {
                setMenuOpen(Menu.NONE);
                if (draft) {
                  setModalOpen(Modal.CREATE);
                } else {
                  setSelectedDashboardIndex(UNSAVED_DASHBOARD_INDEX);
                  createDashboard();
                }
              }}
              handleImportClicked={() => {
                setMenuOpen(Menu.NONE);
                setModalOpen(Modal.IMPORT);
              }}
              handleClose={() => {
                setMenuOpen(Menu.NONE);
                setMenuAnchor(null);
              }}
            />

            <div className='nd-dashboard-panel-header'>
              <div className='nd-dashboard-panel-heading'>
                <span className='n-text-neutral-text-weak'>Dashboards</span>
                {/* Only let users create dashboards and change database when running in editor mode. */}
                {!readonly || (readonly && standaloneSettings.standaloneLoadFromOtherDatabases) ? (
                  <>
                    {!readonly ? (
                      <CleanIconButton
                        description='New dashboard'
                        size='small'
                        className='nd-dashboard-panel-action'
                        onClick={(event) => {
                          setMenuAnchor(event.currentTarget);
                          setMenuOpen(Menu.CREATE);
                        }}
                      >
                        <PlusIconOutline />
                      </CleanIconButton>
                    ) : (
                      <></>
                    )}

                    <CleanIconButton
                      description='Database'
                      size='small'
                      className='nd-dashboard-panel-action'
                      onClick={(event) => {
                        setMenuOpen(Menu.DATABASE);
                        // Only when not yet retrieved, and needed, get the list of databases from Neo4j.
                        if (databases.length == 0) {
                          loadDatabaseListFromNeo4j(driver, (result) => {
                            if (
                              readonly &&
                              standaloneSettings.standaloneMultiDatabase &&
                              standaloneSettings.standaloneDatabaseList
                            ) {
                              let tmp = standaloneSettings.standaloneDatabaseList.split(',').map((x) => x.trim());
                              result = result.filter((value) => tmp.includes(value));
                            }
                            setDatabases(result);
                          });
                        }
                        setMenuAnchor(event.currentTarget);
                      }}
                    >
                      <CircleStackIconOutline />
                    </CleanIconButton>
                  </>
                ) : (
                  <></>
                )}
                <CleanIconButton
                  description='Refresh dashboards'
                  size='small'
                  className='nd-dashboard-panel-action'
                  onClick={() => {
                    getDashboardListFromNeo4j();
                    // When reloading, if the dashboard is not in DRAFT mode, we can directly refresh it.
                    if (!draft) {
                      const d = dashboards[selectedDashboardIndex];
                      loadDashboardFromNeo4j(driver, dashboardDatabase, d.uuid, (file) => {
                        loadDashboard(d.uuid, file);
                      });
                    }
                  }}
                >
                  <ArrowPathIconOutline />
                </CleanIconButton>
              </div>
            </div>
          </div>
          <div className='nd-dashboard-panel-section'>
            <div className='nd-dashboard-panel-header' style={{ marginBottom: '10px' }}>
              <TextInput
                isFluid
                size='small'
                leadingElement={<MagnifyingGlassIconOutline style={{ height: 16, marginTop: '2px' }} />}
                className='n-w-full'
                placeholder='Search...'
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                htmlAttributes={{ 'aria-label': 'Search' }}
              />
            </div>
            {draft && selectedDashboardIndex == UNSAVED_DASHBOARD_INDEX && !readonly ? (
              <DashboardSidebarListItem
                version={NEODASH_VERSION}
                selected={draft}
                title={title}
                saved={false}
                onSelect={() => closePanel()}
                onSettingsOpen={(event) => {
                  setInspectedIndex(UNSAVED_DASHBOARD_INDEX);
                  setMenuOpen(Menu.DASHBOARD);
                  setMenuAnchor(event.currentTarget);
                }}
              />
            ) : (
              <></>
            )}
            {!listLoaded ? (
              // Placeholder rows until the first list arrives, instead of an empty panel that jumps.
              <div className='nd-sidebar-skeleton' aria-hidden>
                <span />
                <span />
                <span />
              </div>
            ) : (
              <></>
            )}
            {dashboards
              .filter((d) => d.title.toLowerCase().includes(searchText.toLowerCase()))
              .map((d) => {
                // index stored in list
                return (
                  <DashboardSidebarListItem
                    key={d.uuid}
                    selected={selectedDashboardIndex == d.index}
                    title={draft && selectedDashboardIndex == d.index ? title : d.title}
                    version={d.version}
                    saved={!(draft && selectedDashboardIndex == d.index)}
                    readonly={readonly}
                    onSelect={() => {
                      if (draft && d.index !== selectedDashboardIndex) {
                        setInspectedIndex(d.index);
                        setModalOpen(Modal.LOAD);
                      } else {
                        // Opening a dashboard closes the panel; with unsaved changes, that waits for
                        // the user to confirm discarding them.
                        closePanel();
                        loadDashboardFromNeo4j(driver, dashboardDatabase, d.uuid, (file) => {
                          loadDashboard(d.uuid, file);
                          setSelectedDashboardIndex(d.index);
                        });
                      }
                    }}
                    onSettingsOpen={(event) => {
                      setInspectedIndex(d.index);
                      setMenuOpen(Menu.DASHBOARD);
                      setMenuAnchor(event.currentTarget);
                    }}
                  />
                );
              })}
          </div>
        </div>
      </nav>
    </div>
  );
};

const mapStateToProps = (state) => ({
  readonly: applicationIsStandalone(state),
  connection: applicationGetConnection(state),
  pagenumber: getPageNumber(state),
  title: getDashboardTitle(state),
  editable: getDashboardIsEditable(state),
  draft: dashboardIsDraft(state),
  dashboard: getDashboardJson(state),
  dashboardSettings: getDashboardSettings(state),
  database: applicationGetConnectionDatabase(state),
  standaloneSettings: applicationGetStandaloneSettings(state),
  expanded: applicationIsSidebarOpen(state),
});

const mapDispatchToProps = (dispatch) => ({
  onRemovePressed: (id) => dispatch(removeReportThunk(id)),
  resetLocalDashboard: () => dispatch(resetDashboardState()),
  setDraft: (draft) => dispatch(setDraft(draft)),
  closePanel: () => dispatch(setSidebarOpen(false)),
  loadDashboard: (uuid, text) => dispatch(loadDashboardThunk(uuid, text)),
  loadDatabaseListFromNeo4j: (driver, callback) => dispatch(loadDatabaseListFromNeo4jThunk(driver, callback)),
  loadDashboardFromNeo4j: (driver, database, uuid, callback) =>
    dispatch(loadDashboardFromNeo4jThunk(driver, database, uuid, callback)),
  loadDashboardListFromNeo4j: (driver, database, callback) =>
    dispatch(loadDashboardListFromNeo4jThunk(driver, database, callback)),
  saveDashboardToNeo4j: (driver: any, database: string, dashboard: any, date: any, user: any, onSuccess) => {
    dispatch(saveDashboardToNeo4jThunk(driver, database, dashboard, date, user, onSuccess));
  },
  deleteDashboardFromNeo4j: (driver: any, database: string, uuid: string, onSuccess) => {
    dispatch(deleteDashboardFromNeo4jThunk(driver, database, uuid, onSuccess));
  },
});

export default connect(mapStateToProps, mapDispatchToProps)(NeoDashboardSidebar);
