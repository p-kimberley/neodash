import { rgbaToHex } from '../chart/Utils';

/**
 * Colour overrides written for the design system's earlier versions keep working: their
 * "--palette-light-…" / "--palette-dark-…" variables (and theme-less "--palette-…", for both) with
 * "R, G, B" values become the current "--theme-light-color-…" / "--theme-dark-color-…" ones.
 */
export const designSystemEquivalents = (key: string, value: string): [string, string][] => {
  const match = /^--palette-(?:(light|dark)-)?(.+)$/.exec(key);
  if (!match) {
    return [];
  }
  const triple = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/.exec(value);
  const colour = triple ? `rgb(${triple[1]} ${triple[2]} ${triple[3]})` : value;
  const themes = match[1] ? [match[1]] : ['light', 'dark'];
  return themes.map((theme) => [`--theme-${theme}-color-${match[2]}`, colour]);
};

export default class StyleConfig {
  private static instance: StyleConfig;

  protected style: any;

  private constructor() {}

  public static async getInstance(): Promise<StyleConfig> {
    if (!this.instance) {
      this.instance = await this.create();
    }
    return this.instance;
  }

  async initialize() {
    try {
      await (await fetch('style.config.json')).json().then((json) => {
        this.style = json;
      });
    } catch (e) {
      this.style = {};
    }
  }

  static async create() {
    const o = new StyleConfig();
    await o.initialize();
    o.applyCSS();
    return o;
  }

  public applyCSS() {
    const rules = this.style?.style || {};
    for (const [key, value] of Object.entries(rules)) {
      document.documentElement.style.setProperty(key, value as string);
      for (const [name, translated] of designSystemEquivalents(key, `${value}`)) {
        document.documentElement.style.setProperty(name, translated);
      }
    }
  }

  public complementColor(color: string) {
    const hexColor = rgbaToHex(document.documentElement.style.getPropertyValue(color));
    const complementColor = (0xffffff - parseInt(hexColor.replace('#', ''), 16)).toString(16);
    return `#${complementColor}`;
  }
}
