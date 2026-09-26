# VisBricks renderer snapshot

`visbricks/` contains the unmodified dependency closure of the original
`prepareChartData` and `renderDeterministicChart` functions, plus the editor's
`polarConcatAxisLayout` / `normalizedPolarRadialBoundaries` helper. Source commit and
SHA-256 values are recorded in `source.json`. This snapshot makes the dataset
branch self-contained without restoring the editor UI, stores, or website.

Only pure renderer dependencies are included; `stores/canvas/coordinates.ts`
provides coordinate utilities, not an application store. Geographic template
metadata remains in the registry, but the offline runner explicitly rejects
geographic blocks because their renderer needs the deck.gl/map viewport.

The wrapper lives outside this snapshot. Renderer behavior is inherited from
VisBricks; changing the source snapshot requires updating its provenance record
and reviewing generated dataset images. Third-party dependencies remain npm
packages with their original licenses.
