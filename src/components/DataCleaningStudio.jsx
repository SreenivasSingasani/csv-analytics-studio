import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Sparkles, AlertTriangle, CheckCircle2, ClipboardList, Eraser,
  Copy, Type, RefreshCw, Undo2, Eye, Play, ShieldCheck
} from "lucide-react";
import {
  getAllDatasetRows, applyDatasetCleaning, getCleaningHistory, undoDatasetCleaning
} from "../db/database.js";

const EMPTY = value => value === null || value === undefined || String(value).trim() === "";
const numberValue = value => Number(String(value ?? "").replace(/,/g, "").trim());

function runTransform(rows, config) {
  const { operation, column, strategy, customValue, textMode, findText, replaceText, targetType, duplicateScope } = config;
  const index = Number(column);
  if (operation === "missing-fill") {
    const values = rows.map(row => row[index]).filter(value => !EMPTY(value));
    let fill = customValue;
    if (strategy === "mean" || strategy === "median") {
      const nums = values.map(numberValue).filter(Number.isFinite);
      if (!nums.length) throw new Error("No numeric values are available for this calculation.");
      nums.sort((a,b) => a-b);
      fill = String(strategy === "mean" ? nums.reduce((a,b)=>a+b,0)/nums.length : nums.length % 2 ? nums[(nums.length-1)/2] : (nums[nums.length/2-1]+nums[nums.length/2])/2);
    } else if (strategy === "mode") {
      const counts = new Map(); values.forEach(value => counts.set(String(value), (counts.get(String(value)) || 0) + 1));
      fill = [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] ?? "";
    }
    let changed = 0;
    const next = rows.map(row => row.map((value, i) => {
      if (i === index && EMPTY(value)) { changed++; return fill; }
      return value;
    }));
    return { rows: next, details: { changed, fillValue: fill } };
  }
  if (operation === "missing-remove") {
    const next = rows.filter(row => !EMPTY(row[index]));
    return { rows: next, details: { removed: rows.length - next.length } };
  }
  if (operation === "duplicates") {
    const seen = new Set();
    const next = rows.filter(row => {
      const key = duplicateScope === "all" ? JSON.stringify(row) : JSON.stringify(row[index]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    return { rows: next, details: { removed: rows.length - next.length } };
  }
  if (operation === "text") {
    let changed = 0;
    const next = rows.map(row => row.map((value, i) => {
      if (i !== index || EMPTY(value)) return value;
      let result = String(value);
      if (textMode === "trim") result = result.trim();
      if (textMode === "spaces") result = result.trim().replace(/\s+/g, " ");
      if (textMode === "upper") result = result.toUpperCase();
      if (textMode === "lower") result = result.toLowerCase();
      if (textMode === "find") result = findText ? result.split(findText).join(replaceText ?? "") : result;
      if (result !== String(value)) changed++;
      return result;
    }));
    return { rows: next, details: { changed } };
  }
  if (operation === "type") {
    let converted = 0, invalid = 0;
    const next = rows.map(row => row.map((value, i) => {
      if (i !== index || EMPTY(value)) return value;
      let result = String(value);
      if (targetType === "number") {
        const parsed = numberValue(value);
        if (!Number.isFinite(parsed)) { invalid++; return value; }
        result = String(parsed);
      } else if (targetType === "date") {
        const parsed = new Date(String(value));
        if (Number.isNaN(parsed.getTime())) { invalid++; return value; }
        result = parsed.toISOString().slice(0, 10);
      } else if (targetType === "boolean") {
        const normalized = String(value).trim().toLowerCase();
        if (["true","yes","1","y"].includes(normalized)) result = "true";
        else if (["false","no","0","n"].includes(normalized)) result = "false";
        else { invalid++; return value; }
      } else if (targetType === "text") result = String(value);
      if (result !== String(value)) converted++;
      return result;
    }));
    return { rows: next, details: { converted, invalid } };
  }
  return { rows, details: {} };
}

function quality(rows, columnCount) {
  let missing = 0;
  rows.forEach(row => { for (let i=0;i<columnCount;i++) if (EMPTY(row[i])) missing++; });
  const seen = new Set(); let duplicates = 0;
  rows.forEach(row => { const key = JSON.stringify(row); if (seen.has(key)) duplicates++; else seen.add(key); });
  return { missing, duplicates, completeness: rows.length && columnCount ? Math.round((1 - missing/(rows.length*columnCount))*100) : 100 };
}

export default function DataCleaningStudio({ dataset, onBack, onDatasetChanged }) {
  const [rows, setRows] = useState([]);
  const [history, setHistory] = useState([]);
  const [operation, setOperation] = useState("missing-fill");
  const [column, setColumn] = useState("0");
  const [strategy, setStrategy] = useState("mode");
  const [customValue, setCustomValue] = useState("");
  const [textMode, setTextMode] = useState("trim");
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [targetType, setTargetType] = useState("number");
  const [duplicateScope, setDuplicateScope] = useState("all");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const [all, edits] = await Promise.all([getAllDatasetRows(dataset.id), getCleaningHistory(dataset.id)]);
    setRows(all); setHistory(edits);
  }
  useEffect(() => { load(); }, [dataset.id]);

  const before = useMemo(() => quality(rows, dataset.headers.length), [rows, dataset.headers.length]);
  const config = { operation, column, strategy, customValue, textMode, findText, replaceText, targetType, duplicateScope };
  const selectedHeader = dataset.headers[Number(column)] || "selected column";
  const operationName = ({"missing-fill":"Fill missing values", "missing-remove":"Remove rows with missing values", duplicates:"Remove duplicate rows", text:"Clean text values", type:"Convert data type"})[operation];

  function createPreview() {
    try {
      const result = runTransform(rows, config);
      const after = quality(result.rows, dataset.headers.length);
      setPreview({ ...result, after, config: { ...config }, operationName });
      setMessage("");
    } catch (error) { setPreview(null); setMessage(error.message); }
  }
  async function apply() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const result = await applyDatasetCleaning(dataset.id, source => runTransform(source, preview.config), `${preview.operationName} · ${selectedHeader}`);
      await load(); setPreview(null); setMessage(`Applied successfully. ${result.beforeRowCount.toLocaleString()} → ${result.afterRowCount.toLocaleString()} rows.`);
      onDatasetChanged?.();
    } catch (error) { setMessage(`Could not apply cleaning: ${error.message}`); }
    finally { setBusy(false); }
  }
  async function undo() {
    if (busy) return;
    setBusy(true);
    try { const ok = await undoDatasetCleaning(dataset.id); if (ok) { await load(); setPreview(null); setMessage("Last cleaning operation undone."); onDatasetChanged?.(); } }
    catch (error) { setMessage(`Undo failed: ${error.message}`); }
    finally { setBusy(false); }
  }
  const canUndo = history.some(item => item.applied);
  const latest = [...history].reverse().find(item => item.applied);

  return <section className="page-content cleaning-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15}/> Back to project</button>
    <div className="page-heading"><div><div className="eyebrow"><i/> DATA CLEANING STUDIO</div><h1 className="page-title">Make your data analysis-ready<span>.</span></h1><p>Clean, standardise and validate your working dataset before analysis.</p></div><span className="working-badge">Working copy only</span></div>

    <div className="cleaning-quality-grid">
      <div className="glass-card cleaning-quality-card"><small>ROWS</small><b>{rows.length.toLocaleString()}</b><span>Current records</span></div>
      <div className="glass-card cleaning-quality-card"><small>MISSING CELLS</small><b>{before.missing.toLocaleString()}</b><span>Across all columns</span></div>
      <div className="glass-card cleaning-quality-card"><small>DUPLICATE ROWS</small><b>{before.duplicates.toLocaleString()}</b><span>Exact row matches</span></div>
      <div className="glass-card cleaning-quality-card"><small>COMPLETENESS</small><b>{before.completeness}%</b><span>Non-empty cells</span></div>
    </div>

    <div className="cleaning-layout">
      <div className="glass-card cleaning-config">
        <div className="cleaning-section-title"><span><Sparkles size={17}/></span><div><h2>Cleaning operations</h2><p>Choose an operation and configure its rules.</p></div></div>
        <label className="cleaning-field">Operation<select value={operation} onChange={e=>{setOperation(e.target.value);setPreview(null);}}><option value="missing-fill">Fill missing values</option><option value="missing-remove">Remove rows with missing values</option><option value="duplicates">Remove duplicate rows</option><option value="text">Clean text values</option><option value="type">Convert data type</option></select></label>
        {operation !== "duplicates" || duplicateScope !== "all" ? <label className="cleaning-field">Column<select value={column} onChange={e=>{setColumn(e.target.value);setPreview(null);}}>{dataset.headers.map((header,i)=><option key={i} value={i}>{header}</option>)}</select></label> : null}
        {operation === "missing-fill" && <><label className="cleaning-field">Fill strategy<select value={strategy} onChange={e=>setStrategy(e.target.value)}><option value="mode">Most frequent value (mode)</option><option value="mean">Mean (numeric)</option><option value="median">Median (numeric)</option><option value="custom">Custom value</option></select></label>{strategy === "custom" && <label className="cleaning-field">Custom value<input value={customValue} onChange={e=>setCustomValue(e.target.value)} placeholder="Enter replacement value"/></label>}</>}
        {operation === "duplicates" && <label className="cleaning-field">Compare duplicates by<select value={duplicateScope} onChange={e=>setDuplicateScope(e.target.value)}><option value="all">Entire row (all columns)</option><option value="column">Selected column only</option></select></label>}
        {operation === "text" && <><label className="cleaning-field">Text operation<select value={textMode} onChange={e=>setTextMode(e.target.value)}><option value="trim">Trim leading/trailing spaces</option><option value="spaces">Collapse repeated spaces</option><option value="upper">Convert to UPPERCASE</option><option value="lower">Convert to lowercase</option><option value="find">Find and replace</option></select></label>{textMode === "find" && <><label className="cleaning-field">Find<input value={findText} onChange={e=>setFindText(e.target.value)} placeholder="Text to find"/></label><label className="cleaning-field">Replace with<input value={replaceText} onChange={e=>setReplaceText(e.target.value)} placeholder="Replacement text (optional)"/></label></>}</>}
        {operation === "type" && <label className="cleaning-field">Convert selected column to<select value={targetType} onChange={e=>setTargetType(e.target.value)}><option value="number">Number</option><option value="date">Date (YYYY-MM-DD)</option><option value="boolean">Boolean (true / false)</option><option value="text">Text</option></select></label>}
        <button className="primary-button cleaning-preview-button" onClick={createPreview}><Eye size={15}/> Preview changes</button>
        <p className="cleaning-safe-note"><ShieldCheck size={14}/> Your imported original CSV is preserved. Changes apply only to the local working copy.</p>
      </div>

      <div className="glass-card cleaning-preview-card">
        <div className="cleaning-section-title"><span><ClipboardList size={17}/></span><div><h2>Preview & impact</h2><p>Review the expected result before applying.</p></div></div>
        {preview ? <>
          <div className="cleaning-impact"><div><small>ROWS BEFORE</small><b>{rows.length.toLocaleString()}</b></div><div><small>ROWS AFTER</small><b>{preview.rows.length.toLocaleString()}</b></div><div><small>ROW CHANGE</small><b>{preview.rows.length-rows.length>0?"+":""}{(preview.rows.length-rows.length).toLocaleString()}</b></div></div>
          <div className="cleaning-result-note"><CheckCircle2 size={16}/><span>{preview.operationName} · {preview.details.changed ?? preview.details.converted ?? preview.details.removed ?? 0} affected value(s)/row(s)</span></div>
          {preview.details.invalid > 0 && <div className="cleaning-warning"><AlertTriangle size={15}/>{preview.details.invalid} values could not be converted and will remain unchanged.</div>}
          <div className="cleaning-before-after"><div><b>Before</b><small>Completeness {before.completeness}% · Missing {before.missing}</small></div><div><b>After</b><small>Completeness {preview.after.completeness}% · Missing {preview.after.missing}</small></div></div>
          <div className="data-table-wrap cleaning-sample"><table className="data-table"><thead><tr><th>#</th>{dataset.headers.slice(0,5).map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{preview.rows.slice(0,5).map((row,i)=><tr key={i}><td>{i+1}</td>{row.slice(0,5).map((v,j)=><td key={j}>{String(v??"") || "—"}</td>)}</tr>)}</tbody></table></div>
          <div className="cleaning-apply-actions"><button className="secondary-button" onClick={()=>setPreview(null)}>Cancel preview</button><button className="primary-button" disabled={busy} onClick={apply}><Play size={14}/> {busy?"Applying…":"Apply cleaning"}</button></div>
        </> : <div className="cleaning-empty-preview"><Eye size={25}/><b>No preview generated yet</b><p>Choose an operation, configure it, then select Preview changes to inspect its impact.</p></div>}
      </div>
    </div>

    <div className="glass-card cleaning-history"><div><h2><RefreshCw size={15}/> Cleaning history</h2><p>{history.length ? `${history.length} operation(s) recorded locally` : "Your applied cleaning operations will appear here."}</p></div><button className="secondary-button compact" disabled={!canUndo || busy} onClick={undo}><Undo2 size={14}/> Undo last cleaning</button>
      {history.length > 0 && <div className="cleaning-history-list">{[...history].reverse().map(item=><div key={item.id}><span><b>{item.description}</b><small>{new Date(item.createdAt).toLocaleString()} · {item.beforeRowCount.toLocaleString()} → {item.afterRowCount.toLocaleString()} rows</small></span><em>{item.applied?"Applied":"Undone"}</em></div>)}</div>}
      {latest && <small className="cleaning-undo-caption">Undo restores the dataset to its state immediately before the latest applied cleaning operation.</small>}
    </div>
    {message && <div className="explorer-notice">{message}<button onClick={()=>setMessage("")}>×</button></div>}
  </section>;
}
