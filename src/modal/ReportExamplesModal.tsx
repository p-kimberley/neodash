import React from 'react';
import NeoCodeEditorComponent from '../component/editor/CodeEditorComponent';
import NeoReport from '../report/Report';
import { Dialog } from '../component/dialog/Dialog';
import { ChartBarIconSolid } from '@neo4j-ndl/react/icons';
import { Section, SectionTitle, SectionContent } from '../modal/ModalUtils';
import { useStore } from 'react-redux';
import { ApiDriver } from '../api/ApiDriver';
import { Neo4jContext } from '../api/Neo4jContext';

/**
 * The Help menu's examples: one rendered report per report type. Opened from the header (the menu
 * unmounts its items when it closes, so the dialog lives outside it).
 */
export const NeoReportExamplesModal = ({ open, onClose, database, examples, extensions }) => {
  // The examples run their synthetic queries through the backend. The dialog lives in the header,
  // outside the dashboard's driver context, so it brings its own.
  const store = useStore();
  const [neo4jContext] = React.useState(() => ({
    driver: new ApiDriver({ getDashboard: () => (store.getState() as any).dashboard }) as any,
  }));

  return (
    <>
      <Dialog isOpen={open} onClose={onClose} className='dialog-xl'>
        <Dialog.Header>
          <ChartBarIconSolid className='icon-base icon-inline text-r' />
          Report Examples
        </Dialog.Header>
        <Dialog.Content>
          <Neo4jContext.Provider value={neo4jContext}>
            <div className='n-flex n-flex-col n-gap-token-8 n-divide-y n-divide-neutral-border-strong'>
              {examples.map((example, index) => {
                return (
                  <Section key={`example-${index}`}>
                    <SectionTitle>{example.title}</SectionTitle>
                    <SectionContent>
                      <div className='n-grid n-grid-cols-3 n-gap-8'>
                        <div className='n-col-span-3'>{example.description}</div>
                        <div className='n-col-span-1'>
                          <NeoCodeEditorComponent
                            editable={false}
                            placeholder=''
                            value={example.exampleQuery}
                            language={example.type == 'iframe' ? 'url' : 'cypher'}
                          ></NeoCodeEditorComponent>
                        </div>

                        <div
                          className='n-col-span-2'
                          style={{
                            height: '355px',
                            overflow: 'hidden',
                            border: '1px solid var(--nd-border)',
                          }}
                        >
                          <NeoReport
                            id={index}
                            query={example.syntheticQuery}
                            database={database}
                            disabled={!open}
                            extensions={extensions}
                            selection={example.selection}
                            parameters={example.globalParameters}
                            settings={example.settings}
                            fields={example.fields}
                            dimensions={example.dimensions}
                            ChartType={example.chartType}
                            type={example.type}
                          />
                        </div>
                      </div>
                    </SectionContent>
                  </Section>
                );
              })}
            </div>
          </Neo4jContext.Provider>
        </Dialog.Content>
      </Dialog>
    </>
  );
};

export default NeoReportExamplesModal;
