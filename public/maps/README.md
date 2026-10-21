# Map data

Country and region shapes for the choropleth and area map charts. They are bundled with NeoDash and
served at `/maps/`, so these charts work without internet access. Set `MAP_DATA_URL` (Helm:
`maps.dataUrl`) only to serve them from somewhere else.

| File | Used by | Features | Matched on |
| --- | --- | --- | --- |
| `world_polymap.json` | Choropleth | 175 countries | `iso_a3` (default), `iso_a2` or `iso_n3`; label `name` |
| `world_polymap_level_0_entities.json` | Area map, country level | 172 countries | `SHORT_COUNTRY_CODE` (ISO alpha-2) or `COUNTRY_CODE` (alpha-3) |
| `world_polymap_level_1_entities.json` | Area map, regions (drill-down) | 2,364 regions | `code`, GeoNames admin-1 style such as `FR.11` (`isoCode` holds the ISO 3166-2 code) |

## Source

Copied unchanged from [neo4j-labs/neodash-static](https://github.com/neo4j-labs/neodash-static) at
commit `9ecfca60fd8a282176030b0d28903788cbd7530d`, the files NeoDash 2.x downloaded at runtime.
Licensed under the Apache License 2.0 (see `LICENSE` in this folder). `SHA256SUMS` lists their
checksums: `sha256sum -c SHA256SUMS`.

The image build stores gzip and Brotli copies next to them (`scripts/precompress.mjs`); the server
sends whichever the browser accepts.
