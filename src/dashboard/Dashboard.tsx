import React from 'react';
import NeoPage from '../page/Page';
import NeoDashboardTitle from './header/DashboardTitle';
import NeoDashboardHeaderPageList from './header/DashboardHeaderPageList';
import { Neo4jContext } from 'use-neo4j/dist/neo4j.context';
import { applicationGetStandaloneSettings, applicationIsSidebarOpen } from '../application/ApplicationSelectors';
import { setSidebarOpen } from '../application/ApplicationActions';
import { connect, useStore } from 'react-redux';
import NeoDashboardSidebar from './sidebar/DashboardSidebar';
import { ApiDriver } from '../api/ApiDriver';

/** A dashboard: sidebar (dashboards list), title, page tabs and the current page's reports. */
const Dashboard = ({ standaloneSettings, sidebarOpen, closeSidebar }) => {
  // Escape closes the open dashboards panel, like the backdrop and the header's menu button.
  React.useEffect(() => {
    if (!sidebarOpen) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeSidebar();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  const store = useStore();
  // All queries go through the backend; the driver only needs to know which dashboard is open.
  // A stable context value: use-neo4j's Neo4jProvider created a new one on every render, which
  // re-rendered every report whenever the dashboard did (e.g. opening the dashboards panel),
  // stalling the panel's animation while graphs rebuilt. Its login and connection checks don't
  // apply here, as the backend owns the connection.
  const [neo4jContext] = React.useState(() => ({
    driver: new ApiDriver({ getDashboard: () => (store.getState() as any).dashboard }) as any,
    config: {} as any,
    updateConnection: () => {},
    setDatabase: () => {},
  }));
  const content = (
    <Neo4jContext.Provider value={neo4jContext}>
      <div className='dashboard-body'>
        {!standaloneSettings.standalone || (standaloneSettings.standalone && standaloneSettings.standaloneAllowLoad) ? (
          // A zero-width slot: the open panel floats over the dashboard instead of squeezing it.
          <div className='dashboard-sidebar-slot'>
            <NeoDashboardSidebar />
          </div>
        ) : (
          <></>
        )}
        {/* Clicking outside the open panel closes it; always mounted so it can fade in and out. */}
        <div className={`dashboard-sidebar-scrim ${sidebarOpen ? 'is-open' : ''}`} onClick={closeSidebar} aria-hidden />
        <div className='n-w-full n-h-full n-flex n-flex-col n-items-center n-justify-center n-rounded-md'>
          <div className='n-w-full n-h-full n-overflow-y-scroll n-flex n-flex-row'>
            {/* Main Content */}
            <main className='n-flex-1 n-relative n-z-0 n-scroll-smooth n-w-full'>
              <div className='n-absolute n-inset-0 page-spacing'>
                <div className='page-spacing-overflow'>
                  <div>
                    <NeoDashboardTitle />
                    <NeoDashboardHeaderPageList />
                    <NeoPage></NeoPage>
                  </div>
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>
    </Neo4jContext.Provider>
  );
  return content;
};

const mapStateToProps = (state) => ({
  standaloneSettings: applicationGetStandaloneSettings(state),
  sidebarOpen: applicationIsSidebarOpen(state),
});

const mapDispatchToProps = (dispatch) => ({
  closeSidebar: () => dispatch(setSidebarOpen(false)),
});

export default connect(mapStateToProps, mapDispatchToProps)(Dashboard);
