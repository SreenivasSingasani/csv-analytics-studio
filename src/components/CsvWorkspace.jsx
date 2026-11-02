import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import DataExplorer from "./DataExplorer.jsx";
import DataCleaningStudio from "./DataCleaningStudio.jsx";
import AnalyticsStudio from "./AnalyticsStudio.jsx";
import VisualizationStudio from "./VisualizationStudio.jsx";
import InsightsStudio from "./InsightsStudio.jsx";
import {
  ArrowLeft, UploadCloud, FileSpreadsheet, Database, RefreshCw,
  Trash2, ShieldCheck, AlertTriangle, CheckCircle2, X, Table2, Eraser, BarChart3, Sparkles
} from "lucide-react";
import {
  db, getProjectDatasets, getDatasetPreview, deleteDataset
} from "../db/database.js";

function makeId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map(v => v.toString(16).padStart(2, "0"));
  return `${h.slice(0,4).join("")}-${h.slice(4,6).join("")}-${h.slice(6,8).join("")}-${h.slice(8,10).join("")}-${h.slice(10).join("")}`;
}
function safeHeaders(values) {
  const used = new Map();
  return values.map((value, index) => {
    const base = String(value ?? "").trim() || `Column ${index + 1}`;
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}
function inferType(values) {
  const sample = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "").slice(0, 500);
  if (!sample.length) return "Empty";
  const isBool = sample.every(v => /^(true|false|yes|no)$/i.test(String(v).trim()));
  if (isBool) return "Boolean";
  const isInteger = sample.every(v => /^[-+]?\d+$/.test(String(v).trim()));
  if (isInteger) return "Integer";
  const isNumber = sample.every(v => String(v).trim() !== "" && Number.isFinite(Number(String(v).replace(/,/g, ""))));
  if (isNumber) return "Decimal";
  const isDate = sample.every(v => !Number.isNaN(Date.parse(String(v))) && /[-/:]/.test(String(v)));
  if (isDate) return "Date";
  return "Text";
}
const fmt = n => new Intl.NumberFormat().format(n || 0);

// React StrictMode replays mount effects in development. Keep a module-level
// guard so the same File object passed from Home is only auto-imported once.
const autoImportedFiles = new WeakSet();

export default function CsvWorkspace({ project, initialFile, onFileImported, onBack, onRename }) {
  const inputRef = useRef(null);
  const parserRef = useRef(null);
  const cancelledRef = useRef(false);
  const [datasets, setDatasets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState([]);
  const [pageLimit, setPageLimit] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches ? 50 : 100
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importMessage, setImportMessage] = useState("");
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [cleaningOpen, setCleaningOpen] = useState(false);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [visualizationOpen, setVisualizationOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const updateLimit = () => setPageLimit(media.matches ? 50 : 100);
    updateLimit();
    media.addEventListener?.("change", updateLimit);
    return () => media.removeEventListener?.("change", updateLimit);
  }, []);

  async function refreshDatasets(selectId = null) {
    const list = await getProjectDatasets(project.id);
    setDatasets(list);
    const chosen = selectId ? list.find(d => d.id === selectId) : (selected ? list.find(d => d.id === selected.id) : list[0]);
    setSelected(chosen || null);
    if (chosen) setPreview(await getDatasetPreview(chosen.id, pageLimit));
    else setPreview([]);
  }
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await getProjectDatasets(project.id);
        if (!active) return;
        setDatasets(list);
        if (list[0]) {
          setSelected(list[0]);
          setPreview(await getDatasetPreview(list[0].id, pageLimit));
        }
      } catch (e) {
        if (active) setImportMessage("Unable to read this project's local datasets.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [project.id, pageLimit]);

  async function importCsv(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv" && file.type !== "application/vnd.ms-excel") {
      setImportMessage("Please select a CSV file.");
      return;
    }
    if (!file.size) { setImportMessage("This CSV file is empty."); return; }
    setBusy(true); setProgress(0); setErrors([]); setImportMessage("Preparing local import…");
    cancelledRef.current = false;
    const datasetId = makeId();
    const now = new Date().toISOString();
    let headers = null, rowCount = 0, chunkIndex = 0, headerChecked = false;
    let inferredSamples = [];
    let parseErrors = [];
    let pending = [];
    try {
      await db.datasets.put({
        id: datasetId, projectId: project.id, name: file.name.replace(/\.csv$/i, ""),
        fileName: file.name, importedAt: now, status: "importing",
        originalFile: file, sizeBytes: file.size, delimiter: ",", headers: [], rowCount: 0, columnTypes: []
      });
      Papa.parse(file, {
        header: false,
        skipEmptyLines: "greedy",
        encoding: "UTF-8",
        worker: false,
        chunkSize: 256 * 1024,
        chunk(results, parser) {
          parserRef.current = parser;
          parser.pause();
          (async () => {
            try {
              if (cancelledRef.current) { parser.abort(); return; }
              if (results.errors?.length) {
                for (const issue of results.errors) {
                  if (parseErrors.length < 100) parseErrors.push({ row: (issue.row ?? 0) + 1, message: issue.message || issue.code || "CSV parsing warning" });
                }
              }
              if (results.meta?.delimiter) {
                const detected = results.meta.delimiter;
                await db.datasets.update(datasetId, { delimiter: detected });
              }
              for (const record of results.data) {
                if (!Array.isArray(record) || record.every(v => String(v ?? "").trim() === "")) continue;
                if (!headerChecked) {
                  headers = safeHeaders(record);
                  headerChecked = true;
                  inferredSamples = headers.map(() => []);
                  continue;
                }
                if (record.length !== headers.length) {
                  if (parseErrors.length < 100) parseErrors.push({ row: rowCount + 2, message: `Expected ${headers.length} fields, found ${record.length}` });
                  const normalized = Array.from({ length: headers.length }, (_, i) => record[i] ?? "");
                  pending.push(normalized);
                } else pending.push(record);
                rowCount++;
                if (inferredSamples.length) {
                  for (let i = 0; i < headers.length; i++) {
                    if (inferredSamples[i].length < 500 && String(record[i] ?? "").trim() !== "") inferredSamples[i].push(record[i]);
                  }
                }
                if (pending.length >= 500) {
                  await db.datasetChunks.add({ datasetId, chunkIndex: chunkIndex++, rows: pending });
                  pending = [];
                }
              }
              setProgress(Math.min(99, Math.round((results.meta?.cursor || 0) / file.size * 100)));
              setImportMessage(`Reading ${fmt(rowCount)} rows…`);
              parser.resume();
            } catch (error) {
              parser.abort();
              throw error;
            }
          })().catch(error => {
            parseErrors.push({ row: 0, message: error?.message || "Import failed" });
            cancelledRef.current = true;
          });
        },
        complete: async () => {
          try {
            if (cancelledRef.current) {
              await db.datasetChunks.where("datasetId").equals(datasetId).delete();
              await db.datasets.delete(datasetId);
              setImportMessage("Import cancelled. No partial dataset was kept.");
              return;
            }
            if (!headerChecked || !headers?.length) throw new Error("Could not detect a header row. Check that the CSV contains column names.");
            if (pending.length) await db.datasetChunks.add({ datasetId, chunkIndex: chunkIndex++, rows: pending });
            const columnTypes = headers.map((header, i) => ({ name: header, type: inferType(inferredSamples[i] || []) }));
            await db.datasets.update(datasetId, {
              status: "ready", headers, rowCount, columnCount: headers.length,
              columnTypes, parseErrors: parseErrors.slice(0, 100),
              importedAt: new Date().toISOString()
            });
            setProgress(100);
            setErrors(parseErrors.slice(0, 8));
            setImportMessage(`Imported ${fmt(rowCount)} rows and ${headers.length} columns. Original CSV retained locally.`);
            await refreshDatasets(datasetId);
          } catch (error) {
            await db.datasetChunks.where("datasetId").equals(datasetId).delete().catch(() => {});
            await db.datasets.delete(datasetId).catch(() => {});
            setImportMessage(error?.name === "QuotaExceededError"
              ? "Not enough browser storage for this CSV. Try a smaller file or free device storage."
              : `CSV import failed: ${error?.message || "Unknown error"}`);
          } finally {
            setBusy(false); parserRef.current = null;
          }
        },
        error: async error => {
          await db.datasetChunks.where("datasetId").equals(datasetId).delete().catch(() => {});
          await db.datasets.delete(datasetId).catch(() => {});
          setImportMessage(`Could not read CSV: ${error.message}`);
          setBusy(false);
        }
      });
    } catch (error) {
      await db.datasets.delete(datasetId).catch(() => {});
      setImportMessage(`Could not start import: ${error?.message || "Unknown error"}`);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialFile && !autoImportedFiles.has(initialFile)) {
      autoImportedFiles.add(initialFile);
      importCsv(initialFile);
      onFileImported?.();
    }
    // File identity is the import request identity. The module-level WeakSet
    // survives StrictMode's development effect replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  function cancelImport() {
    cancelledRef.current = true;
    parserRef.current?.abort();
  }

  async function removeCurrentDataset(dataset) {
    if (!window.confirm(`Remove "${dataset.fileName}" and its imported copy from this project?`)) return;
    await deleteDataset(dataset.id);
    await refreshDatasets();
    setImportMessage("Dataset removed. The original file copy in this project was deleted too.");
  }

  const columns = selected?.headers || [];
  const types = selected?.columnTypes || [];

  if (explorerOpen && selected) {
    return <DataExplorer dataset={selected} onBack={() => setExplorerOpen(false)} />;
  }
  if (cleaningOpen && selected) {
    return <DataCleaningStudio dataset={selected} onBack={async () => { setCleaningOpen(false); await refreshDatasets(selected.id); }} onDatasetChanged={() => refreshDatasets(selected.id)} />;
  }
  if (analyticsOpen && selected) {
    return <AnalyticsStudio dataset={selected} onBack={() => setAnalyticsOpen(false)} />;
  }
  if (visualizationOpen && selected) {
    return <VisualizationStudio dataset={selected} onBack={() => setVisualizationOpen(false)} />;
  }
  if (insightsOpen && selected) {
    return <InsightsStudio dataset={selected} onBack={() => setInsightsOpen(false)} />;
  }

  return <section className="page-content csv-workspace">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15}/> Back to My Projects</button>
    <div className="page-heading workspace-heading"><div><div className="eyebrow"><i/> PROJECT WORKSPACE</div><h1 className="page-title">{project.name}<span>.</span></h1><p>{project.description || "Import a CSV to begin exploring your data."}</p></div><button className="secondary-button" onClick={onRename}>Rename project</button></div>

    <div className="csv-import-panel glass-card">
      <div className="csv-import-icon"><UploadCloud size={22}/></div>
      <div className="csv-import-copy"><h2>Bring your data into this project</h2><p>Import a CSV file. It is processed and stored locally in this browser.</p></div>
      <div className="csv-import-actions">
        <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={e => { const file = e.target.files?.[0]; if (file) importCsv(file); e.target.value = ""; }}/>
        <button className="primary-button" disabled={busy} onClick={() => inputRef.current?.click()}><UploadCloud size={16}/> Choose CSV</button>
        {busy && <button className="secondary-button" onClick={cancelImport}><X size={15}/> Cancel</button>}
      </div>
      {busy && <div className="import-progress"><div className="progress-track"><span style={{width:`${progress}%`}}/></div><div><span>{importMessage}</span><b>{progress}%</b></div></div>}
      {!busy && importMessage && <div className={`import-message ${errors.length ? "has-warnings" : ""}`}><CheckCircle2 size={15}/><span>{importMessage}</span></div>}
      {errors.length > 0 && <div className="import-warnings"><AlertTriangle size={15}/><div><b>Some rows need attention</b>{errors.map((e,i)=><small key={i}>Row {e.row || "—"}: {e.message}</small>)}</div></div>}
      <div className="csv-privacy"><ShieldCheck size={14}/> No CSV upload to a server. Original file and parsed rows are kept in browser storage.</div>
    </div>

    {loading ? <div className="empty-projects glass-card"><RefreshCw size={22}/><p>Loading project datasets…</p></div> :
      datasets.length > 0 ? <>
        <div className="dataset-section-heading"><div><h2>Datasets</h2><p>{datasets.length} dataset{datasets.length === 1 ? "" : "s"} in this project</p></div></div>
        <div className="dataset-list">{datasets.map(dataset => <button key={dataset.id} className={`dataset-list-item ${selected?.id === dataset.id ? "selected" : ""}`} onClick={async () => { setSelected(dataset); setPreview(await getDatasetPreview(dataset.id, pageLimit)); }}>
          <FileSpreadsheet size={17}/><span><b>{dataset.fileName}</b><small>{fmt(dataset.rowCount)} rows · {dataset.columnCount || dataset.headers?.length || 0} columns</small></span><span className="dataset-ready">{dataset.status === "ready" ? "Ready" : dataset.status}</span>
        </button>)}</div>
        {selected && <div className="dataset-detail glass-card">
          <div className="dataset-detail-head"><div><div className="eyebrow"><i/> DATASET OVERVIEW</div><h2>{selected.fileName}</h2><p>Imported {new Date(selected.importedAt).toLocaleString()} · {selected.delimiter === "\t" ? "Tab" : selected.delimiter === ";" ? "Semicolon" : selected.delimiter === "|" ? "Pipe" : "Comma"} delimited</p></div><button className="icon-button dataset-remove" onClick={() => removeCurrentDataset(selected)} title="Remove dataset"><Trash2 size={16}/></button></div>
          <div className="dataset-metrics"><div><small>ROWS</small><b>{fmt(selected.rowCount)}</b></div><div><small>COLUMNS</small><b>{fmt(selected.columnCount || columns.length)}</b></div><div><small>FILE SIZE</small><b>{(selected.sizeBytes / (1024 * 1024)).toFixed(2)} MB</b></div></div>
          <div className="column-type-list"><h3>Detected columns and types</h3><div>{types.map((column,i)=><span key={column.name}><b>{column.name}</b><small>{column.type}</small></span>)}</div></div>
          <div className="preview-heading"><div><h3><Table2 size={16}/> Data preview</h3><p>Showing up to {pageLimit} rows · {fmt(selected.rowCount)} total · read-only preview · {pageLimit === 50 ? "Mobile view" : "Desktop view"}</p></div><div className="dataset-tools"><button className="secondary-button" onClick={() => setCleaningOpen(true)}><Eraser size={14}/> Data Cleaning Studio</button><button className="secondary-button" onClick={() => setAnalyticsOpen(true)}><BarChart3 size={14}/> Analytics Studio</button><button className="secondary-button" onClick={() => setVisualizationOpen(true)}><BarChart3 size={14}/> Visualization Studio</button><button className="secondary-button" onClick={() => setInsightsOpen(true)}><Sparkles size={14}/> Insights Studio</button><button className="primary-button" onClick={() => setExplorerOpen(true)}>Open Data Explorer <ArrowLeft size={14} style={{transform:"rotate(180deg)"}}/></button></div></div>
          <div className="data-table-wrap"><table className="data-table"><thead><tr><th>#</th>{columns.map((c,i)=><th key={i}>{c}</th>)}</tr></thead><tbody>{preview.map((row,i)=><tr key={i}><td>{i+1}</td>{row.map((value,j)=><td key={j}>{String(value ?? "") || <span className="empty-cell">—</span>}</td>)}</tr>)}</tbody></table></div>
        </div>}
      </> : <div className="empty-projects glass-card"><div className="empty-icon"><Database size={25}/></div><h2>No datasets yet</h2><p>Choose a CSV file above. We'll detect its columns and data types, then save it locally.</p></div>}
  </section>;
}
