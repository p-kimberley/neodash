// The Material UI theme for the whole app, built from the design tokens (palette.ts), so MUI
// inputs, menus, tables, tooltips and date pickers match the Neo4j design system components in
// both appearances.
import { createTheme } from '@mui/material/styles';
import type {} from '@mui/x-data-grid/themeAugmentation';
import { FONT_SANS, Mode, palettes } from './palette';

export function createAppTheme(mode: Mode) {
  const p = palettes[mode];
  const hover = mode === 'dark' ? 'rgba(245, 247, 250, 0.07)' : 'rgba(21, 30, 41, 0.05)';
  const selected = mode === 'dark' ? 'rgba(124, 200, 255, 0.16)' : 'rgba(0, 111, 214, 0.1)';

  return createTheme({
    palette: {
      mode,
      primary: { main: p.primary, contrastText: p.onPrimary },
      error: { main: p.danger },
      success: { main: p.success },
      warning: { main: p.warning },
      background: { default: p.bg, paper: p.surfaceRaised },
      text: { primary: p.text, secondary: p.textSecondary, disabled: p.textDisabled },
      divider: p.border,
      action: { hover, selected, disabled: p.textDisabled },
    },
    typography: {
      fontFamily: FONT_SANS,
      fontSize: 14,
      button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: { borderRadius: 8 },
    components: {
      MuiPaper: {
        // Dark-mode MUI adds a white overlay to raised papers; use our surface colours instead.
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiCard: {
        // Floating cards (graph context menu and tooltip) use the raised surface. Report cards are
        // made transparent in components.css, as their container provides the surface.
        styleOverrides: {
          root: { backgroundColor: p.surfaceRaised, border: `1px solid ${p.border}`, borderRadius: 10 },
        },
      },
      MuiPopover: {
        styleOverrides: {
          paper: { border: `1px solid ${p.border}`, boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)' },
        },
      },
      MuiMenuItem: {
        styleOverrides: { root: { fontSize: 14, minHeight: 36 } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            backgroundColor: mode === 'dark' ? '#e8edf3' : '#1f2933',
            color: mode === 'dark' ? '#101820' : '#ffffff',
            fontSize: 12,
            fontWeight: 600,
            padding: '6px 10px',
            borderRadius: 6,
          },
          arrow: { color: mode === 'dark' ? '#e8edf3' : '#1f2933' },
        },
      },
      MuiInputLabel: {
        styleOverrides: { root: { color: p.textSecondary } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: p.surface,
            '& .MuiOutlinedInput-notchedOutline': { borderColor: p.borderStrong },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: p.textMuted },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: p.primary },
          },
        },
      },
      MuiInput: {
        styleOverrides: {
          underline: {
            '&:before': { borderBottomColor: p.borderStrong },
          },
        },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 600 } },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: {
            border: 'none',
            color: p.text,
            fontSize: 14,
            '--DataGrid-rowBorderColor': p.border,
            '--DataGrid-containerBackground': p.surfaceVariant,
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: p.surfaceVariant,
              borderBottom: `1px solid ${p.border}`,
            },
            '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700, color: p.textSecondary },
            '& .MuiDataGrid-cell': { borderColor: p.border },
            '& .MuiDataGrid-row:hover': { backgroundColor: hover },
            '& .MuiDataGrid-footerContainer': { borderTop: `1px solid ${p.border}` },
            '& .MuiTablePagination-root, & .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
              color: p.textSecondary,
            },
            '& .MuiDataGrid-iconSeparator': { color: p.border },
          },
        },
      },
    },
  });
}
