import { z } from 'zod';

// What the browser tells the builder about the dashboard: the report types it can build (with their
// fields and settings, from the app's report configuration) and the context the report is built in.

/** What kind of column a report field needs. */
export const fieldKinds = ['number', 'number_or_datetime', 'text', 'list', 'node_properties'] as const;
export type FieldKind = (typeof fieldKinds)[number];

/** What kind of value a report setting takes. */
export const settingKinds = ['choice', 'number', 'text', 'color', 'dictionary'] as const;

const field = z.object({
  key: z.string().min(1).max(60),
  label: z.string().max(80),
  kind: z.enum(fieldKinds),
  optional: z.boolean().default(false),
  multiple: z.boolean().default(false),
});

const setting = z.object({
  key: z.string().min(1).max(80),
  label: z.string().max(120),
  kind: z.enum(settingKinds),
  /** The allowed values of a choice setting (text, numbers or booleans). */
  values: z
    .array(z.union([z.string(), z.number(), z.boolean()]))
    .max(200)
    .optional(),
});

const reportType = z.object({
  key: z.string().min(1).max(40),
  label: z.string().max(80),
  /** What the report's "query" holds: Cypher, or Markdown for text reports. */
  input: z.enum(['cypher', 'markdown']).default('cypher'),
  fields: z.array(field).max(20).default([]),
  settings: z.array(setting).max(150).default([]),
});

export const catalogueSchema = z.object({ types: z.array(reportType).min(1).max(60) });

export type Catalogue = z.infer<typeof catalogueSchema>;
export type ReportTypeDef = z.infer<typeof reportType>;
export type SettingDef = z.infer<typeof setting>;
export type FieldDef = z.infer<typeof field>;

const text = (max: number) => z.string().max(max);

export const contextSchema = z.object({
  dashboard: z
    .object({
      title: text(200).optional(),
      pages: z.array(text(200)).max(50).default([]),
      page: text(200).optional(),
    })
    .default({ pages: [] }),
  /** Dashboard parameters ($neodash_...) and their current values, usable in queries. */
  parameters: z.record(z.string().max(120), z.unknown()).default({}),
  /** The report being built or changed. */
  report: z
    .object({
      title: text(200).optional(),
      type: text(40).optional(),
      query: text(10_000).optional(),
      width: z.number().int().min(1).max(48).optional(),
      height: z.number().int().min(1).max(100).optional(),
    })
    .default({}),
  /** The dashboard's other reports. */
  others: z
    .array(z.object({ title: text(200).optional(), type: text(40).optional(), query: text(2_000).optional() }))
    .max(60)
    .default([]),
});

export type BuildContext = z.infer<typeof contextSchema>;

/** A report as the builder produces it (and as the browser applies it). */
export interface ReportSpec {
  type: string;
  title: string;
  query: string;
  /** Field key -> column name (several columns for a field that takes several). */
  selection: Record<string, string | string[]>;
  settings: Record<string, unknown>;
  /** Why this report (suggestions), or what it shows. */
  why?: string;
}

export const suggestionSchema = z.object({
  type: z.string().max(40),
  title: z.string().max(200).default(''),
  query: z.string().max(20_000).default(''),
  selection: z.record(z.string(), z.union([z.string(), z.array(z.string())])).default({}),
  settings: z.record(z.string(), z.unknown()).default({}),
  why: z.string().max(500).optional(),
});
