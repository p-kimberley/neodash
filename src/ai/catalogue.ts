import { SELECTION_TYPES } from '../config/CardConfig';
import { getReportTypes } from '../extensions/ExtensionUtils';

// What Build with AI is told about the report types this dashboard can use: their fields (what kind
// of column each needs) and settings (with allowed values), from the app's report configuration. The
// server checks every report the model writes against it.

export interface CatalogueField {
  key: string;
  label: string;
  kind: 'number' | 'number_or_datetime' | 'text' | 'list' | 'node_properties';
  optional: boolean;
  multiple: boolean;
}

export interface CatalogueSetting {
  key: string;
  label: string;
  kind: 'choice' | 'number' | 'text' | 'color' | 'dictionary';
  values?: (string | number | boolean)[];
}

export interface CatalogueType {
  key: string;
  label: string;
  input: 'cypher' | 'markdown';
  fields: CatalogueField[];
  settings: CatalogueSetting[];
}

/** Report types Build with AI doesn't build: they are set up through their own forms, or hold a URL. */
const NOT_BUILT = new Set(['select', 'forms', 'iframe']);

const fieldKind = (type: SELECTION_TYPES): CatalogueField['kind'] => {
  switch (type) {
    case SELECTION_TYPES.NUMBER:
      return 'number';
    case SELECTION_TYPES.NUMBER_OR_DATETIME:
      return 'number_or_datetime';
    case SELECTION_TYPES.LIST:
      return 'list';
    case SELECTION_TYPES.NODE_PROPERTIES:
      return 'node_properties';
    default:
      return 'text';
  }
};

const settingOf = (key: string, def: any): CatalogueSetting | undefined => {
  const label = `${def?.label ?? key}`.slice(0, 120);
  switch (def?.type) {
    case SELECTION_TYPES.LIST: {
      const values = (def.values ?? []).filter((v) => ['string', 'number', 'boolean'].includes(typeof v));
      return values.length ? { key, label, kind: 'choice', values: values.slice(0, 200) } : undefined;
    }
    case SELECTION_TYPES.NUMBER:
      return { key, label, kind: 'number' };
    case SELECTION_TYPES.COLOR:
      return { key, label, kind: 'color' };
    case SELECTION_TYPES.DICTIONARY:
      return { key, label, kind: 'dictionary' };
    case SELECTION_TYPES.TEXT:
    case SELECTION_TYPES.MULTILINE_TEXT:
      return { key, label, kind: 'text' };
    default:
      return undefined;
  }
};

/** The report types (with fields and settings) of a dashboard with these extensions. */
export const buildCatalogue = (extensions: Record<string, any>): { types: CatalogueType[] } => ({
  types: Object.entries(getReportTypes(extensions))
    .filter(([key, t]: [string, any]) => !NOT_BUILT.has(key) && (!t.textOnly || key === 'text'))
    .map(([key, t]: [string, any]) => ({
      key,
      label: `${t.label ?? key}`,
      input: key === 'text' ? ('markdown' as const) : ('cypher' as const),
      fields: Object.entries(t.selection ?? {})
        .slice(0, 20)
        .map(([fieldKey, f]: [string, any]) => ({
          key: fieldKey,
          label: `${f.label ?? fieldKey}`,
          kind: fieldKind(f.type),
          optional: Boolean(f.optional),
          multiple: Boolean(f.multiple),
        })),
      settings: Object.entries(t.settings ?? {})
        .map(([settingKey, def]) => settingOf(settingKey, def))
        .filter((s): s is CatalogueSetting => Boolean(s))
        .slice(0, 150),
    })),
});
