// Builds the documentation (docs/modules/ROOT, written in AsciiDoc for Antora) into a static site
// that the app serves at /docs, so it can be read without internet access. Each page is a plain
// HTML file with the navigation tree, an "on this page" list and previous/next links; search runs
// in the browser on an index written alongside. Nothing is loaded from elsewhere: remote images
// are replaced by their link text, and external links open in a new tab.
//
//   node scripts/build-docs.mjs <output directory>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from '@asciidoctor/core';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(repo, 'docs/modules/ROOT');
const PAGES = path.join(SOURCE, 'pages');
const VIEWER = path.join(repo, 'docs/viewer');
const out = process.argv[2];
if (!out) {
  console.error('usage: node scripts/build-docs.mjs <output directory>');
  process.exit(1);
}
const version = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version;
const warnings = [];

const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

// Page ids are paths under pages/ without the extension, e.g. user-guide/reports/table.
const pageIds = walk(PAGES)
  .filter((f) => f.endsWith('.adoc'))
  .map((f) =>
    path
      .relative(PAGES, f)
      .split(path.sep)
      .join('/')
      .replace(/\.adoc$/, '')
  )
  // The banner is an include (a note pointing upstream users to the commercial product), not a page.
  .filter((id) => id !== 'banner')
  .sort();
const exists = new Set(pageIds);

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const stripTags = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&#8217;|&#8216;|&#39;/g, "'")
    .replace(/&#8212;/g, '—')
    .replace(/&#8230;/g, '…')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const rootPrefix = (id) => '../'.repeat(id.split('/').length - 1);

// --- Navigation (nav.adoc) -------------------------------------------------------------------------

/** [{ title, id, children }] from Antora's nested "* xref:page.adoc[Title]" list. */
function parseNav() {
  const root = { children: [] };
  const stack = [root];
  for (const line of fs.readFileSync(path.join(SOURCE, 'nav.adoc'), 'utf8').split(/\r?\n/)) {
    const m = /^(\*+)\s+xref:([^[]+)\.adoc\[([^\]]*)\]/.exec(line);
    if (!m) continue;
    const depth = m[1].length;
    const item = { id: m[2], title: m[3], children: [] };
    stack.length = depth;
    (stack[depth - 1] ?? root).children.push(item);
    stack[depth] = item;
  }
  return root.children;
}
const nav = parseNav();
const order = [];
const parents = new Map();
(function flatten(items, trail) {
  for (const item of items) {
    order.push(item);
    parents.set(item.id, trail);
    flatten(item.children, [...trail, item]);
  }
})(nav, []);

function renderNav(items, current, prefix) {
  const li = (item) => {
    const here = item.id === current;
    const link = `<a href="${prefix}${item.id}.html"${here ? ' aria-current="page"' : ''}>${escapeHtml(item.title)}</a>`;
    if (!item.children.length) return `<li>${link}</li>`;
    const open = here || (parents.get(current) ?? []).some((p) => p.id === item.id);
    return `<li><details${open ? ' open' : ''}><summary>${link}</summary>${renderNav(item.children, current, prefix)}</details></li>`;
  };
  return `<ul>${items.map(li).join('')}</ul>`;
}

// --- Links -----------------------------------------------------------------------------------------

/**
 * Pages link to each other with URLs relative to where Antora published them: page a/b.adoc at
 * a/b/ or at a/b (the pages assume one or the other), and a/index.adoc at a/. Maps such a link to
 * the page id it means, or undefined.
 */
function resolveRelativeLink(fromId, target) {
  const dir = fromId.endsWith('index') ? fromId.slice(0, -5) : null;
  const bases = dir !== null ? [`/${dir}`] : [`/${fromId}/`, `/${fromId}`];
  const kebab = (s) => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  for (const base of bases) {
    const url = new URL(target, `http://docs${base}`);
    const p = decodeURIComponent(url.pathname)
      .replace(/^\/+|\/+$/g, '')
      .replace(/\.(adoc|html)$/, '');
    const candidates = p === '' ? ['index'] : [p, `${p}/index`, kebab(p), `${kebab(p)}/index`];
    const id = candidates.find((c) => exists.has(c));
    if (id) return { id, hash: url.hash };
  }
  return undefined;
}

function preprocess(id, source) {
  const prefix = rootPrefix(id);
  return (
    source
      .replace(/^include::[^[]*banner\.adoc\[\]\s*$/gm, '')
      // xref:page.adoc#anchor[text]: relative to pages/, as in Antora.
      .replace(/xref:([^[\s#]+)\.adoc(#[^[\s]*)?\[/g, (_, target, hash = '') => `link:${prefix}${target}.html${hash}[`)
      // link:relative/url[text]: relative to the page's Antora URL.
      .replace(/link:(?![a-z][a-z0-9+.-]*:)([^[\s]+)\[([^\]]*)\]/g, (whole, target, text) => {
        if (target.startsWith('#')) return whole;
        const resolved = resolveRelativeLink(id, target);
        if (!resolved) {
          warnings.push(`${id}: link to "${target}" doesn't match a page; kept as text`);
          return text;
        }
        return `link:${prefix}${resolved.id}.html${resolved.hash}[${text}]`;
      })
      // ``Text'': quotes in an older AsciiDoc syntax.
      .replace(/``([^`'\n]+)''/g, '“$1”')
      // label:Text[]: a Neo4j docs macro for badges.
      .replace(/label:([^[\s]+)\[\]/g, (_, text) => `pass:[<span class="badge">${text}</span>]`)
  );
}

function postprocess(html) {
  return (
    html
      // Remote images would be fetched from the internet: show their alternative text instead.
      .replace(/<img src="https?:[^"]*" alt="([^"]*)"[^>]*>/g, (_, alt) => `<span class="remote-image">${alt}</span>`)
      // External links (which need internet access) open in a new tab and are marked as such.
      .replace(/<a href="(https?:|mailto:)/g, '<a class="external" target="_blank" rel="noopener noreferrer" href="$1')
      // Screenshots open full size.
      .replace(
        /<div class="content">\n<img src="([^"]+)"/g,
        '<div class="content">\n<a class="image-link" href="$1" target="_blank"><img src="$1"'
      )
      .replace(/(<a class="image-link"[^>]*><img [^>]*>)/g, '$1</a>')
  );
}

// --- Pages -----------------------------------------------------------------------------------------

function template({ id, title, body, sections }) {
  const prefix = rootPrefix(id);
  const index = order.findIndex((item) => item.id === id);
  const prev = index > 0 ? order[index - 1] : undefined;
  const next = index >= 0 && index < order.length - 1 ? order[index + 1] : undefined;
  const trail = parents.get(id) ?? [];
  const crumbs = trail.length
    ? `<nav class="crumbs" aria-label="Breadcrumbs">${trail.map((p) => `<a href="${prefix}${p.id}.html">${escapeHtml(p.title)}</a>`).join('<span aria-hidden="true">/</span>')}</nav>`
    : '';
  const pager =
    prev || next
      ? `<nav class="pager" aria-label="Previous and next pages">${
          prev
            ? `<a class="prev" href="${prefix}${prev.id}.html"><span>Previous</span>${escapeHtml(prev.title)}</a>`
            : '<span></span>'
        }${next ? `<a class="next" href="${prefix}${next.id}.html"><span>Next</span>${escapeHtml(next.title)}</a>` : ''}</nav>`
      : '';
  const toc = sections.length
    ? `<aside class="toc" aria-label="On this page"><div class="toc-title">On this page</div><ul>${sections
        .map((s) => `<li><a href="#${s.id}">${s.title}</a></li>`)
        .join('')}</ul></aside>`
    : '<aside class="toc"></aside>';
  return `<!doctype html>
<html lang="en" data-root="${prefix}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(stripTags(title))} · NeoDash documentation</title>
<link rel="icon" href="${prefix}../favicon.ico">
<link rel="stylesheet" href="${prefix}assets/docs.css">
<script src="${prefix}assets/docs.js"></script>
<script src="${prefix}search-index.js" defer></script>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="top">
<button class="icon-button menu-toggle" type="button" aria-label="Show navigation" aria-expanded="false" aria-controls="sidebar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
<a class="brand" href="${prefix}index.html">NeoDash <span>Documentation</span></a>
<span class="version">${escapeHtml(version)}</span>
<div class="search" role="search">
<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
<input type="search" placeholder="Search" aria-label="Search the documentation" autocomplete="off" aria-controls="search-results" aria-expanded="false">
<kbd>/</kbd>
<ol id="search-results" class="results" role="listbox" hidden></ol>
</div>
<button class="icon-button theme-toggle" type="button" aria-label="Switch between light and dark"><svg class="sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg></button>
</header>
<div class="layout">
<div class="scrim" aria-hidden="true"></div>
<nav id="sidebar" class="sidebar" aria-label="Documentation">${renderNav(nav, id, prefix)}</nav>
<main id="content">
${crumbs}
<article class="doc">
<h1>${title}</h1>
${body}
</article>
${pager}
</main>
${toc}
</div>
</body>
</html>
`;
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'assets/fonts'), { recursive: true });

const converted = [];
for (const id of pageIds) {
  const file = path.join(PAGES, `${id}.adoc`);
  const source = preprocess(id, fs.readFileSync(file, 'utf8'));
  const doc = await load(source, {
    safe: 'safe',
    base_dir: path.dirname(file),
    attributes: {
      imagesdir: `${rootPrefix(id)}images`,
      'docs-version': version,
      sectanchors: '',
      idprefix: '_',
      idseparator: '_',
    },
  });
  const title = (await doc.getDocumentTitle()) ?? id;
  const sections = await Promise.all(
    (await doc.getSections()).map(async (s) => ({ id: s.getId(), title: await s.getTitle() }))
  );
  const body = postprocess(await doc.convert());
  converted.push({
    id,
    title,
    body,
    sections,
    anchors: new Set([...body.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])),
  });
}

// Links to a heading use the id it had elsewhere (e.g. #row-limiting for _row_limiting) or one that
// no longer exists: point them at the matching heading, or else at the top of the page.
const anchorsOf = new Map(converted.map((c) => [c.id, c.anchors]));
const loose = (anchor) => anchor.replace(/[^a-z0-9]/gi, '').toLowerCase();
function fixAnchors(id, body) {
  return body.replace(/href="([^"#:]*.html|)#([^"]+)"/g, (whole, file, anchor) => {
    const base = `http://docs/${id}`;
    const target = file ? new URL(file, base).pathname.slice(1).replace(/.html$/, '') : id;
    const anchors = anchorsOf.get(target);
    if (!anchors || anchors.has(decodeURIComponent(anchor))) return whole;
    const match = [...anchors].find((a) => loose(a) === loose(decodeURIComponent(anchor)));
    if (!match) warnings.push(`${id}: link to ${file || ''}#${anchor}: no such heading; links to the page instead`);
    return `href="${file}${match ? `#${match}` : ''}"`;
  });
}

const searchIndex = [];
for (const page of converted) {
  const { id, title, sections } = page;
  const body = fixAnchors(id, page.body);
  fs.mkdirSync(path.dirname(path.join(out, `${id}.html`)), { recursive: true });
  fs.writeFileSync(path.join(out, `${id}.html`), template({ id, title, body, sections }));
  searchIndex.push({
    u: `${id}.html`,
    t: stripTags(title),
    s: (parents.get(id) ?? []).map((p) => p.title).join(' › '),
    h: sections.map((s) => ({ id: s.id, t: stripTags(s.title) })),
    x: stripTags(body),
  });
}
fs.writeFileSync(path.join(out, 'search-index.js'), `window.ND_DOCS_INDEX = ${JSON.stringify(searchIndex)};\n`);

fs.cpSync(path.join(SOURCE, 'images'), path.join(out, 'images'), { recursive: true });
for (const f of ['docs.css', 'docs.js']) fs.copyFileSync(path.join(VIEWER, f), path.join(out, 'assets', f));
// The app's fonts, so the documentation looks like the app without fetching anything.
for (const [pkg, files] of [
  ['nunito-sans', ['latin-400-normal', 'latin-600-normal', 'latin-700-normal']],
  ['fira-code', ['latin-400-normal']],
]) {
  for (const f of files) {
    fs.copyFileSync(
      path.join(repo, `node_modules/@fontsource/${pkg}/files/${pkg}-${f}.woff2`),
      path.join(out, `assets/fonts/${pkg}-${f}.woff2`)
    );
  }
}

for (const w of warnings) console.warn(`docs: ${w}`);
console.log(`docs: ${pageIds.length} pages written to ${out}`);
