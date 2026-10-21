# Map data

The choropleth and area map charts load country shapes from this folder (served at `/maps/`), so
they work without internet access. Point `MAP_DATA_URL` elsewhere to serve them from another place.

Expected files (GeoJSON `FeatureCollection`s):

| File | Used by | Feature properties |
| --- | --- | --- |
| `world_polymap.json` | Choropleth | `iso_a3`, `iso_a2`, `iso_n3` country codes |
| `world_polymap_level_0_entities.json` | Area map (countries) | ISO 3166-1 alpha-2 / alpha-3 codes |
| `world_polymap_level_1_entities.json` | Area map (regions) | region codes such as `FR.32` |

These used to be downloaded from `github.com/neo4j-contrib/neodash-static`, which no longer exists.
