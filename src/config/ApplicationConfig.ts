import StyleConfig from './StyleConfig';

export const enum Screens {
  WELCOME_SCREEN,
  CONNECTION_MODAL,
}

const styleConfig = await StyleConfig.getInstance();

export const DEFAULT_SCREEN = Screens.WELCOME_SCREEN; // WELCOME_SCREEN
export const DEFAULT_NEO4J_URL = 'localhost'; // localhost
export const DEFAULT_DASHBOARD_TITLE = 'New dashboard';

export const DASHBOARD_HEADER_COLOR = styleConfig?.style?.DASHBOARD_HEADER_COLOR || '#0B297D'; // '#0B297D'

export const DASHBOARD_HEADER_BUTTON_COLOR = styleConfig?.style?.DASHBOARD_HEADER_BUTTON_COLOR || null; // '#FFFFFF22'

export const DASHBOARD_HEADER_TITLE_COLOR = styleConfig?.style?.DASHBOARD_HEADER_TITLE_COLOR || '#FFFFFF'; // '#FFFFFF'

export const DASHBOARD_HEADER_BRAND_LOGO =
  styleConfig?.style?.DASHBOARD_HEADER_BRAND_LOGO || 'neo4j-icon-color-full.png';

export const IS_CUSTOM_LOGO = Boolean(styleConfig?.style?.DASHBOARD_HEADER_BRAND_LOGO);

// Product name in the header and browser tab, e.g. your organisation's name for the tool.
export const APP_NAME: string = styleConfig?.style?.APP_NAME || 'NeoDash';

export const CUSTOM_CONNECTION_FOOTER_TEXT = ''; // ''

/** Letters shown in the header mark: "ND" for NeoDash, otherwise the initials of APP_NAME. */
export const markText = (): string => {
  if (APP_NAME === 'NeoDash') {
    return 'ND';
  }
  return APP_NAME.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
};
