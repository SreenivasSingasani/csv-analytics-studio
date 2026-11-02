## 🚀 Live Demo

**Try CSV Analytics Studio:** [Open Web Application](https://csv-analytics-studio.singasanisreenivas06.workers.dev)

Analyze CSV files directly in your browser without requiring Python or advanced Excel knowledge.

### ✨ Key Features

- Browser-based CSV analysis
- Interactive data visualization
- Data insights and exploration
- Local-first data processing
- IndexedDB-based local project storage
- Backup and restore functionality

**Available Platforms:** Web Application | Android Application



# CSV Analytics Studio — Phase 3: CSV Import Engine

Built By Sreenu_Zero6 · Ideas into applications.

## Implemented in this phase
- CSV file selection inside a project workspace
- Papa Parse-based delimiter detection (comma, semicolon, tab and other detected delimiters)
- Header row extraction; blank headers receive Column N names and duplicate headers are made unique
- Row parsing with inconsistent-width row warnings and padding for missing cells
- Basic column type inference: Empty, Boolean, Integer, Decimal, Date and Text
- Original selected CSV retained as a Blob in IndexedDB
- Parsed row data stored locally in IndexedDB chunks of up to 500 rows
- Import progress and cancellation control
- Dataset list per project
- Dataset metrics and detected column types
- Read-only first-50-row preview
- Remove dataset and its local parsed/original copies
- Existing projects preserved by Dexie schema migration to version 2

## Important limitations
- This phase is a first CSV import and preview foundation, not the full Data Explorer.
- CSV parsing is currently performed in the browser main thread in chunked callbacks; large-file stress testing and worker offloading are still needed.
- Type detection samples up to 500 non-empty values per column; it is a heuristic, not a guarantee.
- Date detection uses JavaScript date parsing and may be ambiguous across regional date formats.
- Encoding selection is UTF-8; legacy encodings are not yet configurable.
- Original file Blob plus parsed chunks use storage space twice. Browser quotas vary by browser/device and can be evicted or cleared.
- No hard maximum file size is promised. Test with representative files before relying on very large imports.
- No cleaning, editing, charts, insights, Parquet conversion, backup or Android native file adapter yet.

## Run locally
```bash
npm install
npm run dev -- --host 0.0.0.0
```


## Responsive preview row limit
- Desktop/tablet-wide viewports (>700px): loads up to 100 preview rows.
- Mobile/narrow viewports (<=700px): loads up to 50 preview rows.
- The full dataset remains stored; this is only a responsive preview limit.


## Phase 4 — Data Explorer (initial)
- Search across all imported rows and columns
- Sort by a selected column ascending/descending
- Toggle column visibility
- Responsive page sizes (mobile defaults 50, desktop defaults 100) and pagination
- Double-click cells for quick edits; Enter saves, Escape cancels
- Undo/redo quick cell edits, with an edit history panel
- Edits are written to parsed working chunks; original CSV Blob remains unchanged
- Advanced bulk cleaning operations remain reserved for Data Cleaning Studio

Limitations: current Data Explorer loads a dataset's parsed rows into memory for search/sort and the current first implementation is intended for functional validation on modest datasets. Large-dataset worker-backed querying and richer filters are future performance work. CSV export and advanced cleaning transformations are not included in this initial Phase 4 delivery.


## Phase 5 — Data Cleaning Studio (initial)
- Dedicated Data Cleaning Studio entry from the selected dataset workspace
- Data-quality overview: row count, missing-cell count, exact duplicate-row count and completeness percentage
- Missing-value operations: fill using mode, mean, median or a custom value; remove rows missing the selected column
- Duplicate removal: exact full-row matches or duplicates based on one selected column
- Text cleaning: trim, collapse repeated whitespace, uppercase/lowercase, find and replace
- Data type conversion: number, ISO date (`YYYY-MM-DD`), boolean and text; invalid values remain unchanged and are reported in the preview
- Preview operation impact, row counts, completeness and sample rows before applying
- Bulk changes are stored in the local working dataset; the imported original CSV Blob is not modified
- Cleaning history and undo of the latest applied cleaning operation
- Database schema v4 adds local cleaning history; deleting a dataset/project also removes its edit and cleaning history
- Cell-edit history is preserved in the cleaning snapshot and safely restored when the cleaning operation is undone

Phase 5 is an initial functional implementation for modest datasets. Data profiling and transformations currently load parsed rows into memory; worker-backed processing, very-large-dataset optimisation, richer date-format controls, multi-column rules, CSV export and multi-step redo are not part of this delivery. Undo snapshots retain the pre-cleaning chunks and therefore consume additional local storage; available browser storage varies by device and browser. Back up important work when backup/export is available in a later phase.


## Phase 6 — Analytics Studio (initial local engine)
- Dedicated Analytics Studio entry from the selected dataset workspace
- Dataset overview and numeric-column detection
- Descriptive statistics: valid numeric count, missing/invalid count, distinct count, sum, mean, median, mode, min/max, population variance and standard deviation
- Group-by summaries with record count, sum, average, minimum and maximum
- Pearson correlation for two selected numeric columns, excluding incomplete pairs
- Distribution analysis with quartiles, IQR fences, outlier flags and an equal-width frequency histogram
- Filter/query builder with text and numeric comparisons, empty/not-empty checks, optional second condition using AND/OR, and across-column search
- Filtered result preview and export to a separate CSV file
- Analysis reads the current local working dataset and does not mutate it; the imported original CSV remains unchanged

Important Phase 6 limitations: this first release uses a local JavaScript analytics engine, not DuckDB-Wasm or SQL execution. It loads the parsed working dataset into browser memory, so available device memory and browser limits affect large files. Correlation is Pearson linear correlation and does not imply causation. Distribution outliers use the 1.5 × IQR rule. Filter preview is capped at 100 rows, while CSV export includes all matching rows. Worker-backed processing, DuckDB-Wasm, SQL editor, advanced multi-rule query groups and large-dataset optimisation remain future upgrades.

## Phase 7 — Visualization Studio (initial implementation)

- Added a Visualization Studio entry from the selected dataset workspace.
- Chart builder supports horizontal bar, column, line, area, pie, donut, scatter, histogram, and box-plot views using responsive inline SVG (no chart CDN or paid API).
- Select category/X and value/Y columns, chart title, and count/sum/average aggregation where applicable.
- Hover chart marks for values; export the current chart as SVG, high-resolution PNG (2× or 3×; white or transparent background), and its plotted series as CSV.
- Download individual dashboard-canvas chart previews as PNG (2×).
- Add chart previews to a drag-reorderable dashboard canvas.
- Save chart definitions locally in IndexedDB (`savedCharts`, Dexie schema v5), reload saved definitions, edit their settings, and delete them.
- Saved charts are scoped to the dataset and removed when that dataset or its project is deleted.
- Uses the current working dataset; original CSV is not modified.

### Phase 7 initial limitations
- This is the first chart-builder milestone, not a full BI dashboard designer.
- The dashboard canvas arrangement is session-only in this initial version; individual chart definitions are persisted.
- Multiple data series, advanced formatting, dashboard-level persistence, and very-large-dataset rendering optimisations are not included yet. PNG export rasterises the current SVG chart in the browser using Canvas; export quality and maximum dimensions are subject to browser canvas limits.
- Chart rendering reads the dataset into browser memory; practical limits depend on the device/browser.
- Build verification is pending because `npm install` timed out in the build environment. Run `npm install` and `npm run build` locally before relying on a production build.


## Phase 7.1.2 — Complete PNG chart composition fix
- PNG/SVG export now selects the chart-render SVG rather than unrelated toolbar icons.
- Pie and donut exports include the category legend and values alongside the chart.
- Pie charts no longer render a total label over the centre; the centre total remains a donut-only feature.
- Exported title and chart composition are embedded in the image; white and transparent backgrounds and 2×/3× scaling remain available.
- Export rendering is performed locally in the browser.


## Phase 8 — Insights Studio (initial local, explainable analysis)
- Added an Insights Studio entry to the selected dataset workspace.
- Dataset overview with row count, data completeness, missing-cell count, exact duplicate-row count and usable numeric-field count.
- Numeric profiles with valid count, mean, median, minimum, maximum and potential outlier count.
- Missing-value and exact-duplicate observations with suggested review actions.
- Potential outliers flagged using the 1.5 × IQR rule; flags are not treated as proof of errors.
- Pearson correlation highlights for numeric column pairs; correlation is explicitly not presented as causation.
- Monthly average trend comparisons when a recognisable date column and at least three monthly periods are available.
- Most frequent categorical values and distinct-value highlights.
- Export findings, numeric summaries, correlations and trend points as a local JSON report.
- All analysis reads the current working dataset in the browser; the original imported CSV is unchanged. No paid AI API, server upload, or cloud processing is used.

### Phase 8 initial limitations
- Findings are deterministic statistical observations and transparent heuristics, not generative AI, predictive modelling, or causal inference.
- Date parsing relies on the browser's JavaScript date parser and may not interpret every regional date format correctly.
- Monthly trend comparisons require parseable dates and at least three periods; they compare first and last period averages and do not forecast.
- Analysis currently loads the working dataset into browser memory. Worker-backed and very-large-dataset processing are future performance work.
- The exported report is JSON; PDF report export and user-configurable insight thresholds are not included in this initial release.
- Re-run/reopen Insights Studio to refresh findings after changing the working dataset.


## Phase 8.0.1 — Strict date detection correction
- Monthly trend analysis now accepts explicit ISO dates (YYYY-MM-DD, optionally with a time) and slash-formatted dates (DD/MM/YYYY, with an unambiguous MM/DD/YYYY case).
- Numeric-looking values are rejected as dates, preventing age, income, score, and other numeric columns from being misclassified by permissive browser date parsing.
- Trend analysis only pairs detected date columns with separate usable numeric columns.
- This fixes false month labels such as 1950-01 and 100000-01 that can arise when plain numbers are passed to JavaScript Date parsing.


## Phase 9.1 — Workspace Backup & Restore

- Export the full local workspace to a portable `.cvas` file.
- Includes projects, datasets, original CSV `Blob` files, parsed data chunks, cell-edit history, cleaning snapshots/history, and saved chart definitions.
- Uses a SHA-256 checksum to detect accidental corruption or modification before restore.
- Validates backup format, schema version, project/dataset references, and original-file presence before replacing data.
- Restore is an explicit replace operation with a confirmation prompt; backups are not merged.
- The backup is generated locally in the browser. The user chooses where to save it.
- Browser storage quotas still apply. Keep separate copies of important `.cvas` files.
- Current export format version: 1 (`cvas-workspace-backup`).

Phase 9.1 is implemented in the Settings page. PWA and Android work have not been started in this package.


### Phase 9.1.1 — Orphaned history compatibility fix

- Older versions could leave dataset-scoped history records after a dataset was deleted.
- Backup export now excludes only records in datasetChunks, editHistory, cleaningHistory, and savedCharts whose datasetId no longer exists.
- The live IndexedDB workspace is not modified by this cleanup.
- The backup records the count of excluded orphan records in its integrity-protected `cleanup` metadata.
- Restore still validates all remaining references before replacing the workspace.


## Phase 9.2 — Progressive Web App (PWA)

- Added a web app manifest, app icons, theme metadata, and standalone display configuration.
- Added a production service worker that precaches the app shell and built JS/CSS assets, serves navigation offline, and caches same-origin static assets.
- Added online/offline status in the application top bar.
- Added an install prompt button when the browser supports `beforeinstallprompt`.
- Added Apple mobile web-app metadata and touch icon.
- Removed the remote Google Fonts import so the core UI does not depend on an external font request while offline; system font fallbacks are used.
- Service worker registration is production-only. `npm run dev` does not register it.
- PWA installation and service-worker offline behavior require HTTPS or localhost. LAN HTTP addresses are not secure contexts for service workers on most browsers.
- Local IndexedDB data remains browser/device-specific. Installing the PWA does not sync data between browsers or devices.
- Android Capacitor packaging is not included in this milestone.


## Phase 9.2.1 — Full-screen desktop navigation refinement

- Desktop workspace now opens with the sidebar hidden and the main content using the full viewport width.
- The menu button opens a fixed-position floating sidebar over the page; the main content does not resize or shift.
- Sidebar uses translucent liquid-glass styling, blur, subtle violet/silver borders, and a slide animation.
- A transparent outside-click surface closes the desktop sidebar without dimming the page underneath.
- The sidebar close button is visible on desktop while open.
- Mobile navigation behavior remains drawer-based.


## Phase 9.2.3 — Auto-close desktop sidebar on navigation

- Selecting Home, My Projects, or Settings now closes both the mobile drawer and desktop floating sidebar.
- Navigation content continues to use the full-width workspace after the sidebar closes.
- This is a focused interaction fix; no data, storage, PWA, or backup logic was changed.


## Phase 9.3 — Android integration (Capacitor 8)

### Included in this source package
- Capacitor 8.6 dependencies and Android platform package.
- `capacitor.config.json` with app ID `com.builtbysreenuzero6.csvanalyticsstudio`, app name, `dist` web output, HTTPS Android scheme, dark status bar styling, and keyboard resize settings.
- Native runtime initialization for Android status bar and keyboard.
- App-private filesystem adapter using Capacitor Filesystem `Directory.Data`.
- Service worker registration is disabled inside the native WebView; PWA service-worker registration remains enabled for production web builds.
- npm scripts for adding, syncing, opening, and preparing Android builds.

### Create the Android Studio project (one time)
1. Install Node.js 22+ and Android Studio 2025.2.1 or newer.
2. In Android Studio SDK Manager, install Android SDK Platform 36 and Android SDK Build-Tools.
3. Open this project folder in VS Code and run:
   - `npm.cmd install`
   - `npm.cmd run build`
   - `npm.cmd run cap:add:android`
   - `npm.cmd run cap:sync`
   - `npm.cmd run cap:open`
4. Android Studio opens the generated `android/` project. Allow Gradle sync to finish.
5. In Android Studio, set the app's minimum SDK to API 31 (Android 12) or higher if the generated template has a lower minimum. Keep compile/target SDK values at the installed supported SDK.
6. Select a physical Android 12+ device or emulator and press Run.

### Updating the Android app after web changes
Run `npm.cmd run android:build`, then open Android Studio and run the app again.

### Important scope and limitations
- This ZIP contains the Capacitor configuration and native integration source, but does not include a generated `android/` Gradle project or an APK. The Android project is generated locally by `cap add android` after dependencies are installed, and the APK is built in Android Studio.
- Android Studio, Android SDK and Gradle build verification must be performed on the developer's Windows machine.
- Existing project and dataset persistence continues to use Dexie/IndexedDB inside the Android WebView. The app-private Filesystem adapter is provided for native file workflows; migrating original CSV and backup storage into native files is a separate integration/test step, not claimed as complete here.
- Native app data is stored locally. Uninstalling the Android app removes its app-private data; users should export `.cvas` backups before uninstalling.
- The package ID is intended to be stable. Changing it later creates a different Android application identity.

### Environment
- Capacitor 8 requires Node.js 22+.
- Android development requires Android Studio and an Android SDK installation.
- Android 12+ is the target device range for this project.


## Phase 9.3.2 — Android PNG export compatibility

The chart PNG exporter now uses the existing SVG-to-canvas renderer on both web and native. In Capacitor Android, the PNG is written to the app cache and opened in the Android native share sheet, where the user can save it to a supported destination or share it. Browser/PWA downloads continue to use the browser download flow. This requires `@capacitor/share` and the existing `@capacitor/filesystem` plugin.


## Phase 9.3.4 – Android filtered CSV export compatibility

The Analytics Studio **Export filtered CSV** action now detects Capacitor native
runtime. On Android it writes the generated CSV into the app cache using the
Capacitor Filesystem plugin and opens the native Android share sheet using the
Capacitor Share plugin. Users can choose a compatible destination/app to save
or share the file. In browser/PWA mode it continues to use a browser download.

The export includes the current filtered rows and original dataset headers.


## Phase 9.3.5 – Unified file export handling

All generated-file exports now use the shared `src/platform/exportFile.js` helper:
- Android/Capacitor: writes the Blob to the app cache and opens the native Share sheet.
- Browser/PWA: retains the standard Blob URL download flow.

Migrated exports include Insights JSON, filtered CSV, chart PNG, chart-data CSV, chart SVG, and full `.cvas` workspace backups. The chart PNG rendering pipeline and report/data generation logic remain unchanged. Android export actions require the existing Capacitor Filesystem and Share plugins.

This source update has not been built or device-tested in this environment. Rebuild and verify all export types on Android and web before treating the change as complete.
