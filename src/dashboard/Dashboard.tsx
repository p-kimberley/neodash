import React from 'react';
import NeoPage from '../page/Page';
import NeoDashboardTitle from './header/DashboardTitle';
import NeoDashboardHeaderPageList from './header/DashboardHeaderPageList';
import { Neo4jProvider } from 'use-neo4j';
import { applicationGetStandaloneSettings } from '../application/ApplicationSelectors';
import { connect, useStore } from 'react-redux';
import NeoDashboardSidebar from './sidebar/DashboardSidebar';
import { ApiDriver } from '../api/ApiDriver';

/** A dashboard: sidebar (dashboards list), title, page tabs and the current page's reports. */
const Dashboard = ({ standaloneSettings }) => {
  const store = useStore();
  // All queries go through the backend; the driver only needs to know which dashboard is open.
  const [driver] = React.useState(() => new ApiDriver({ getDashboard: () => (store.getState() as any).dashboard }));
  const content = (
    <Neo4jProvider driver={driver as any}>
      <div className='dashboard-body'>
        {!standaloneSettings.standalone || (standaloneSettings.standalone && standaloneSettings.standaloneAllowLoad) ? (
          <NeoDashboardSidebar />
        ) : (
          <></>
        )}
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
    </Neo4jProvider>
  );
  return content;
};

const mapStateToProps = (state) => ({
  standaloneSettings: applicationGetStandaloneSettings(state),
});

export default connect(mapStateToProps)(Dashboard);
