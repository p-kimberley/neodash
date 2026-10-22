import React from 'react';
import { EXTENSIONS } from './ExtensionConfig';
import { connect } from 'react-redux';
import { createNotificationThunk } from '../page/PageThunks';
import { getDashboardExtensions } from '../dashboard/DashboardSelectors';
import { setExtensionEnabled } from '../dashboard/DashboardActions';
import { setExtensionReducerEnabled } from './state/ExtensionActions';
import { TextLink, Typography, Checkbox, IconButton } from '@neo4j-ndl/react';
import { Dialog } from '../component/dialog/Dialog';
import { PuzzlePieceIconSolid } from '@neo4j-ndl/react/icons';
import { Section, SectionContent } from '../modal/ModalUtils';
import { Tip } from '../component/text/Tip';
import { docsUrl } from '../utils/docs';

const NeoExtensionsModal = ({
  extensions,
  setExtensionEnabled,
  onExtensionUnavailableTriggered, // Action to take when the user tries to enable a disabled extension.
  setExtensionReducerEnabled,
  closeMenu,
}) => {
  const [open, setOpen] = React.useState(false);

  const handleClickOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    closeMenu();
  };

  return (
    <>
      <IconButton description='Extensions' className='n-mx-1' onClick={handleClickOpen}>
        <PuzzlePieceIconSolid />
      </IconButton>

      {open ? (
        <Dialog size='large' isOpen={open} onClose={handleClose}>
          <Dialog.Header>
            <PuzzlePieceIconSolid className='icon-base icon-inline text-r' />
            Extensions
          </Dialog.Header>
          <Dialog.Content>
            <div className='n-flex n-flex-col n-gap-token-8 n-divide-y n-divide-neutral-border-strong'>
              <Section>
                <SectionContent>
                  <TextLink target='_blank' href={docsUrl('user-guide/extensions/index')} type='external'>
                    Extensions
                  </TextLink>
                  &nbsp;are a way of extending the core functionality of NeoDash with custom logic. This can be a new
                  visualization, extra styling options for an existing visualization, or even a completely new logic for
                  the dashboarding engine.
                </SectionContent>
              </Section>

              {Object.values(EXTENSIONS)
                .map((e) => ({ ...e, unavailableReason: undefined }))
                .map((e, key) => {
                  return (
                    <Section key={key}>
                      <SectionContent>
                        <div style={{ opacity: e.enabled ? 1.0 : 0.6 }}>
                          <table>
                            <tbody>
                              <tr>
                                <td>
                                  <div className='n-flex n-flex-row n-gap-token-8 n-items-center'>
                                    <Typography variant='subheading-large'>{e.label}</Typography>
                                  </div>
                                </td>
                                <td style={{ width: 50 }}></td>
                                <td style={{ float: 'right' }}>
                                  <Tip title='Enable the extension'>
                                    <span>
                                      <Checkbox
                                        label='Active'
                                        isDisabled={!e.enabled}
                                        style={{ fontSize: 'small' }}
                                        isChecked={extensions[e.name]}
                                        onClick={() => {
                                          let active = extensions[e.name] == undefined ? true : undefined;
                                          if (e.enabled) {
                                            setExtensionEnabled(e.name, active);

                                            // Subscribing the reducer binded to the newly enabled extension
                                            // to the extensionReducer
                                            if (e.reducerPrefix) {
                                              setExtensionReducerEnabled(e.reducerPrefix, active);
                                            }
                                          } else {
                                            onExtensionUnavailableTriggered(e.label);
                                            // If an extension presents a reducer, we need to unbind it from the extension reducer
                                            if (e.reducerPrefix) {
                                              setExtensionReducerEnabled(e.reducerPrefix, active);
                                            }
                                          }
                                        }}
                                        htmlAttributes={{ id: `checkbox-${e.name}`, name: 'enable' }}
                                      />
                                    </span>
                                  </Tip>
                                </td>
                              </tr>
                              <tr>
                                <td valign='top'>
                                  <br />
                                  <p>{e.description}</p>
                                  {e.unavailableReason ? (
                                    <p>
                                      <i>{e.unavailableReason}</i>
                                    </p>
                                  ) : (
                                    <></>
                                  )}
                                  <br />
                                  <p>
                                    By {e.author} ·{' '}
                                    <TextLink href={e.link} target='_blank' type='external'>
                                      Documentation
                                    </TextLink>
                                  </p>
                                </td>
                                <td></td>
                                <td style={{ width: 300 }}>
                                  <br />
                                  <img src={e.image} style={{ border: '1px solid grey', width: '100%' }}></img>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </SectionContent>
                    </Section>
                  );
                })}
            </div>
          </Dialog.Content>
        </Dialog>
      ) : (
        <></>
      )}
    </>
  );
};

const mapStateToProps = (state) => ({
  extensions: getDashboardExtensions(state),
});

const mapDispatchToProps = (dispatch) => ({
  setExtensionEnabled: (name, enabled) => dispatch(setExtensionEnabled(name, enabled)),
  setExtensionReducerEnabled: (name, enabled) => dispatch(setExtensionReducerEnabled(name, enabled)),
  onExtensionUnavailableTriggered: (name) =>
    dispatch(
      createNotificationThunk(
        `Extension '${name}' Unavailable`,
        // eslint-disable-next-line no-multi-str
        'This extension is not available in this version of NeoDash.\n  \
     To learn more about expert extensions, check out the project documentation.'
      )
    ),
});

export default connect(mapStateToProps, mapDispatchToProps)(NeoExtensionsModal);
