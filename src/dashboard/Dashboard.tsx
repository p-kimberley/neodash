import React from 'react';
import NeoPage from '../page/Page';
import NeoDashboardHeader from './header/DashboardHeader';
import NeoDashboardTitle from './header/DashboardTitle';
import NeoDashboardHeaderPageList from './header/DashboardHeaderPageList';
import { Neo4jProvider } from 'use-neo4j';
import { applicationGetConnection, applicationGetStandaloneSettings } from '../application/ApplicationSelectors';
import { connect, useStore } from 'react-redux';
import NeoDashboardSidebar from './sidebar/DashboardSidebar';
import { ApiDriver } from '../api/ApiDriver';

const Dashboard = ({
  connection,
  standaloneSettings,
  onDownloadDashboardAsImage,
  onAboutModalOpen,
  resetApplication,
}) => {
  const store = useStore();
  // All queries go through the backend; the driver only needs to know which dashboard is open.
  const [driver] = React.useState(() => new ApiDriver({ getDashboard: () => (store.getState() as any).dashboard }));
  const content = (
    <Neo4jProvider driver={driver as any}>
      {/* Navigation Bar */}
      <div
        className='n-w-screen n-flex n-flex-row n-items-center n-bg-neutral-bg-weak n-border-b'
        style={{ borderColor: 'lightgrey' }}
      >
        <NeoDashboardHeader
          connection={connection}
          onDownloadImage={onDownloadDashboardAsImage}
          onAboutModalOpen={onAboutModalOpen}
          resetApplication={resetApplication}
        ></NeoDashboardHeader>
      </div>
      {/* Main Page */}
      <div
        style={{
          display: 'flex',
          height: 'calc(40vh - 32px)',
          minHeight: window.innerHeight - 62,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
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
                  {/* The main content of the page */}
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
  connection: applicationGetConnection(state),
  standaloneSettings: applicationGetStandaloneSettings(state),
});

export default connect(mapStateToProps)(Dashboard);
