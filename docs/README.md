# NeoDash Documentation

This folder contains the documentation for the NeoDash project. The pages are written in AsciiDoc (`modules/ROOT/pages`, navigation in `modules/ROOT/nav.adoc`).

## In the app

The app serves the documentation at `/docs`, so it can be read without internet access; the Help menu and the "documentation" links in the app open it in a new tab. The build (`yarn build`, and the Docker image) converts the pages into a static site in `dist/docs` with `scripts/build-docs.mjs`; the viewer's script and styles are in `viewer/`.

To preview it with the dev server, run `yarn docs` (it writes to `docs/build`, which the dev server serves at http://localhost:5173/docs/); `yarn dev` does this on start. The build warns about links between pages that don't resolve, and links to the top of the page when a heading they name doesn't exist.

Pages are linked with `xref:path/to/page.adoc[Title]` (relative to `pages/`). Images go in `modules/ROOT/images`; images from elsewhere on the internet are shown as their alternative text, so the documentation never loads anything from outside the app.

## Antora

Upstream NeoDash publishes the same sources with Antora at https://neo4j.com/labs/neodash/{version}. To build that site locally, run `yarn install` and `yarn start` in this folder, then open http://localhost:8000/.
