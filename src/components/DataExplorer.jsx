import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Search, ArrowUpDown, ChevronLeft, ChevronRight, Eye,
  Undo2, Redo2, Pencil, Check, X, Filter, Table2, History
} from "lucide-react";
import {
  getAllDatasetRows, updateDatasetCell, getEditHistory, applyEditHistory
} from "../db/database.js";

const PAGE_OPTIONS = [25, 50, 100, 250];

export default function DataExplorer({ dataset, onBack }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(() => window.matchMedia("(max-width: 700px)").matches ? 50 : 100);
  const [sort, setSort] = useState({ column: -1, direction: "asc" });
  const [editing, setEditing] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [history, setHistory] = useState([]);
  const [notice, setNotice] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState(dataset.headers.map((_, i) => i));
  const [showColumns, setShowColumns] = useState(false);

  async function load() {
    setRows(await getAllDatasetRows(dataset.id));
    setHistory(await getEditHistory(dataset.id));
  }
  useEffect(() => {
    load();
    const media = window.matchMedia("(max-width: 700px)");
    const change = () => setPageSize(media.matches ? 50 : 100);
    media.addEventListener?.("change", change);
    return () => media.removeEventListener?.("change", change);
  }, [dataset.id]);

  const filtered = useMemo(() => {
    let result = rows.map((row, index) => ({ row, originalIndex: index })).filter(({ row }) =>
      row.some(value => String(value ?? "").toLowerCase().includes(search.toLowerCase()))
    );
    if (sort.column >= 0) result.sort((a, b) => {
      const av = String(a.row[sort.column] ?? ""), bv = String(b.row[sort.column] ?? "");
      const an = Number(av), bn = Number(bv);
      const cmp = av.trim() !== "" && bv.trim() !== "" && Number.isFinite(an) && Number.isFinite(bn)
        ? an - bn : av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
      return sort.direction === "asc" ? cmp : -cmp;
    });
    return result;
  }, [rows, search, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = filtered.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => { if (page >= pageCount) setPage(Math.max(0, pageCount - 1)); }, [page, pageCount]);

  function startEdit(rowIndex, columnIndex, value) {
    setEditing({ rowIndex, columnIndex });
    setEditValue(String(value ?? ""));
  }
  async function commitEdit() {
    if (!editing) return;
    try {
      await updateDatasetCell(dataset.id, editing.rowIndex, editing.columnIndex, editValue);
      await load();
      setNotice("Cell updated in the working dataset. Original CSV remains unchanged.");
      setEditing(null);
    } catch (error) { setNotice(`Could not save edit: ${error.message}`); }
  }
  async function undo() {
    const last = [...history].reverse().find(item => item.applied);
    if (!last) return;
    await applyEditHistory(last.id, true); await load(); setNotice("Last cell edit undone.");
  }
  async function redo() {
    const next = history.find(item => !item.applied);
    if (!next) return;
    await applyEditHistory(next.id, false); await load(); setNotice("Cell edit redone.");
  }
  const canUndo = history.some(item => item.applied);
  const canRedo = history.some(item => !item.applied);

  return <section className="page-content explorer-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15}/> Back to project</button>
    <div className="page-heading"><div><div className="eyebrow"><i/> DATA EXPLORER</div><h1 className="page-title">{dataset.fileName}<span>.</span></h1><p>Inspect, search, sort and make quick edits to your working data.</p></div></div>
    <div className="explorer-toolbar glass-card">
      <div className="explorer-search"><Search size={16}/><input value={search} onChange={e => {setSearch(e.target.value);setPage(0);}} placeholder="Search across all columns..."/></div>
      <button className="secondary-button compact" onClick={() => setShowColumns(v => !v)}><Eye size={15}/> Columns</button>
      <button className="secondary-button compact" onClick={() => setShowHistory(v => !v)}><History size={15}/> History</button>
      <button className="icon-button" disabled={!canUndo} onClick={undo} title="Undo edit"><Undo2 size={16}/></button>
      <button className="icon-button" disabled={!canRedo} onClick={redo} title="Redo edit"><Redo2 size={16}/></button>
    </div>
    {showColumns && <div className="column-picker glass-card"><b>Visible columns</b><div>{dataset.headers.map((header, i)=><label key={i}><input type="checkbox" checked={visibleColumns.includes(i)} onChange={e=>setVisibleColumns(old=>e.target.checked?[...old,i]:old.filter(x=>x!==i))}/>{header}</label>)}</div></div>}
    {showHistory && <div className="history-panel glass-card"><b>Cell edit history</b>{history.length ? history.map(item=><div key={item.id}><span>Row {item.rowIndex+1} · {dataset.headers[item.columnIndex]}: {String(item.oldValue)} → {String(item.newValue)}</span><small>{item.applied ? "Applied" : "Undone"}</small></div>) : <p>No edits yet.</p>}</div>}
    <div className="explorer-table-card glass-card">
      <div className="table-card-head"><div><h2><Table2 size={16}/> Dataset table</h2><p>{filtered.length.toLocaleString()} matching rows · double-click a cell to edit</p></div><span className="working-badge">Working copy</span></div>
      <div className="data-table-wrap explorer-table-wrap"><table className="data-table explorer-table"><thead><tr><th>#</th>{dataset.headers.map((header,i)=>visibleColumns.includes(i)&&<th key={i}><button onClick={()=>setSort(old=>({column:i,direction:old.column===i&&old.direction==="asc"?"desc":"asc"}))}>{header}<ArrowUpDown size={12}/></button></th>)}</tr></thead><tbody>
        {current.map(({row,originalIndex})=><tr key={originalIndex}><td>{originalIndex+1}</td>{row.map((value,j)=>visibleColumns.includes(j)&&<td key={j} onDoubleClick={()=>startEdit(originalIndex,j,value)} title="Double-click to edit">{editing?.rowIndex===originalIndex&&editing?.columnIndex===j?<div className="cell-editor"><input autoFocus value={editValue} onChange={e=>setEditValue(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")setEditing(null);}}/><button onClick={commitEdit}><Check size={13}/></button><button onClick={()=>setEditing(null)}><X size={13}/></button></div>:String(value??"")||<span className="empty-cell">—</span>}</td>)}</tr>)}
      </tbody></table></div>
      <div className="table-pagination"><span>Showing {filtered.length ? page*pageSize+1 : 0}–{Math.min((page+1)*pageSize,filtered.length)} of {filtered.length}</span><label>Rows <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(0);}}><option>25</option><option>50</option><option>100</option><option>250</option></select></label><div><button className="icon-button" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={15}/></button><span>{page+1} / {pageCount}</span><button className="icon-button" disabled={page+1>=pageCount} onClick={()=>setPage(p=>p+1)}><ChevronRight size={15}/></button></div></div>
    </div>
    {notice && <div className="explorer-notice">{notice}<button onClick={()=>setNotice("")}><X size={13}/></button></div>}
    <p className="explorer-footnote">Quick edits update the local working copy only. The imported original CSV is preserved. Advanced bulk transformations belong in Data Cleaning Studio.</p>
  </section>;
}
