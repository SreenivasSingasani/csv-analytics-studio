import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Activity, Calculator, BarChart3, Filter, GitBranch,
  Sigma, Table2, RefreshCw, Search, Download
} from "lucide-react";
import { getAllDatasetRows } from "../db/database.js";
import { exportFile } from "../platform/exportFile.js";

const numeric = value => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const cleaned = String(value).trim().replace(/[₹$€£,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
const fmt = value => Number.isFinite(value) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(value) : "—";
const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};
const numericIndexes = (rows, headers) => headers.map((h, i) => ({ h, i })).filter(({ i }) => {
  const values = rows.slice(0, 250).map(row => row[i]).filter(v => String(v ?? "").trim() !== "");
  return values.length > 0 && values.filter(v => numeric(v) !== null).length / values.length >= 0.8;
});

function calculateStats(values) {
  const nums = values.map(numeric).filter(v => v !== null).sort((a,b) => a-b);
  if (!nums.length) return { count: 0, missing: values.length, distinct: new Set(values.filter(v => String(v ?? "").trim() !== "").map(v => String(v))).size, sum: null, mean: null, median: null, mode: null, min: null, max: null, variance: null, std: null };
  const counts = new Map();
  nums.forEach(n => counts.set(n, (counts.get(n) || 0) + 1));
  const maxCount = [...counts.values()].reduce((max, count) => Math.max(max, count), 0);
  const modes = [...counts].filter(([, count]) => count === maxCount).map(([n]) => n);
  const mean = nums.reduce((a,b) => a+b, 0) / nums.length;
  const variance = nums.reduce((sum,n) => sum + (n-mean) ** 2, 0) / nums.length;
  return {
    count: nums.length, missing: values.length - nums.length,
    distinct: new Set(values.filter(v => String(v ?? "").trim() !== "").map(v => String(v))).size,
    sum: nums.reduce((a,b) => a+b, 0), mean,
    median: quantile(nums, .5), mode: modes.join(", "), min: nums[0], max: nums.at(-1), variance, std: Math.sqrt(variance)
  };
}
function correlation(a, b) {
  const pairs = a.map((v,i) => [numeric(v), numeric(b[i])]).filter(([x,y]) => x !== null && y !== null);
  if (pairs.length < 2) return { value: null, count: pairs.length };
  const mx = pairs.reduce((s,p)=>s+p[0],0)/pairs.length, my = pairs.reduce((s,p)=>s+p[1],0)/pairs.length;
  const numerator = pairs.reduce((s,[x,y])=>s+(x-mx)*(y-my),0);
  const dx = pairs.reduce((s,[x])=>s+(x-mx)**2,0), dy = pairs.reduce((s,[,y])=>s+(y-my)**2,0);
  return { value: dx && dy ? numerator/Math.sqrt(dx*dy) : null, count: pairs.length };
}

function matches(value, operator, expected) {
  const leftNum = numeric(value), rightNum = numeric(expected);
  switch (operator) {
    case "equals": return String(value ?? "").toLowerCase() === expected.toLowerCase();
    case "not-equals": return String(value ?? "").toLowerCase() !== expected.toLowerCase();
    case "contains": return String(value ?? "").toLowerCase().includes(expected.toLowerCase());
    case "starts": return String(value ?? "").toLowerCase().startsWith(expected.toLowerCase());
    case "gt": return leftNum !== null && rightNum !== null && leftNum > rightNum;
    case "gte": return leftNum !== null && rightNum !== null && leftNum >= rightNum;
    case "lt": return leftNum !== null && rightNum !== null && leftNum < rightNum;
    case "lte": return leftNum !== null && rightNum !== null && leftNum <= rightNum;
    case "empty": return String(value ?? "").trim() === "";
    case "not-empty": return String(value ?? "").trim() !== "";
    default: return true;
  }
}

export default function AnalyticsStudio({ dataset, onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [column, setColumn] = useState("0");
  const [groupColumn, setGroupColumn] = useState("0");
  const [groupSecondEnabled, setGroupSecondEnabled] = useState(false);
  const [groupSecondColumn, setGroupSecondColumn] = useState("3");
  const [metricColumn, setMetricColumn] = useState("0");
  const [aggregation, setAggregation] = useState("count");
  const [xColumn, setXColumn] = useState("0");
  const [yColumn, setYColumn] = useState("1");
  const [filterColumn, setFilterColumn] = useState("0");
  const [filterOperator, setFilterOperator] = useState("contains");
  const [filterValue, setFilterValue] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [secondEnabled, setSecondEnabled] = useState(false);
  const [logic, setLogic] = useState("and");
  const [secondColumn, setSecondColumn] = useState("0");
  const [secondOperator, setSecondOperator] = useState("equals");
  const [secondValue, setSecondValue] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    getAllDatasetRows(dataset.id).then(data => { if (active) setRows(data); })
      .catch(error => { if (active) setNotice(`Could not load dataset: ${error.message}`); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [dataset.id]);

  const nums = useMemo(() => numericIndexes(rows, dataset.headers), [rows, dataset.headers]);
  const numericSet = useMemo(() => new Set(nums.map(item => item.i)), [nums]);
  useEffect(() => {
    if (!nums.length) return;
    setColumn(String(nums[0].i));
    setMetricColumn(String(nums[0].i));
    setXColumn(String(nums[0].i));
    setYColumn(String((nums[1] || nums[0]).i));
    const preferredCategory = dataset.headers.findIndex(header => /city|category|region|department|status|segment|type/i.test(header));
    const categorical = dataset.headers.findIndex((_, index) => !nums.some(item => item.i === index));
    if (preferredCategory >= 0) setGroupColumn(String(preferredCategory));
    else if (categorical >= 0) setGroupColumn(String(categorical));
    if (categorical >= 0) setGroupSecondColumn(String(categorical));
  }, [dataset.id, nums, dataset.headers]);
  const stats = useMemo(() => calculateStats(rows.map(row => row[Number(column)])), [rows, column]);
  const grouped = useMemo(() => {
    const groups = new Map();
    rows.forEach(row => {
      const primary = String(row[Number(groupColumn)] ?? "").trim() || "(Blank)";
      const secondary = String(row[Number(groupSecondColumn)] ?? "").trim() || "(Blank)";
      const key = groupSecondEnabled ? `${primary} · ${secondary}` : primary;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return [...groups.entries()].map(([name, groupRows]) => {
      const values = groupRows.map(row => numeric(row[Number(metricColumn)])).filter(v => v !== null);
      let result = groupRows.length;
      if (aggregation === "sum") result = values.reduce((a,b)=>a+b,0);
      if (aggregation === "average") result = values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
      if (aggregation === "min") result = values.length ? values.reduce((a,b)=>Math.min(a,b), Infinity) : null;
      if (aggregation === "max") result = values.length ? values.reduce((a,b)=>Math.max(a,b), -Infinity) : null;
      return { name, result, records: groupRows.length };
    }).sort((a,b) => (b.result ?? -Infinity) - (a.result ?? -Infinity));
  }, [rows, groupColumn, groupSecondEnabled, groupSecondColumn, metricColumn, aggregation]);
  const relation = useMemo(() => correlation(rows.map(row=>row[Number(xColumn)]), rows.map(row=>row[Number(yColumn)])), [rows, xColumn, yColumn]);
  const distribution = useMemo(() => {
    const values = rows.map(row=>numeric(row[Number(column)])).filter(v=>v!==null).sort((a,b)=>a-b);
    const q1=quantile(values,.25), q2=quantile(values,.5), q3=quantile(values,.75), iqr=q3===null?null:q3-q1;
    const lower=iqr===null?null:q1-1.5*iqr, upper=iqr===null?null:q3+1.5*iqr;
    const outliers=iqr===null?[]:values.filter(v=>v<lower||v>upper);
    const bins = [];
    if (values.length) {
      const min=values[0], max=values.at(-1), binCount= Math.min(10, Math.max(1, Math.ceil(Math.sqrt(values.length))));
      const width=(max-min || 1)/binCount;
      for(let i=0;i<binCount;i++) bins.push({ label: `${fmt(min+i*width)}–${fmt(i===binCount-1?max:min+(i+1)*width)}`, count:0 });
      values.forEach(v=>{ const index=Math.min(binCount-1,Math.floor((v-min)/width)); bins[index].count++; });
    }
    return { count:values.length, min:values[0]??null, max:values.at(-1)??null, q1,q2,q3,iqr,lower,upper,outliers,bins };
  }, [rows, column]);
  const filteredRows = useMemo(() => rows.filter(row => {
    const firstRule = matches(row[Number(filterColumn)], filterOperator, filterValue);
    const secondRule = matches(row[Number(secondColumn)], secondOperator, secondValue);
    const byRules = !secondEnabled ? firstRule : logic === "and" ? firstRule && secondRule : firstRule || secondRule;
    const bySearch = !filterSearch || row.some(value=>String(value??"").toLowerCase().includes(filterSearch.toLowerCase()));
    return byRules && bySearch;
  }), [rows, filterColumn, filterOperator, filterValue, filterSearch, secondEnabled, logic, secondColumn, secondOperator, secondValue]);

  const tabs = [
    ["overview", "Overview", Activity], ["statistics", "Statistics", Calculator],
    ["group", "Group By", Table2], ["relationship", "Relationships", GitBranch],
    ["distribution", "Distribution", BarChart3], ["query", "Filter & Query", Filter]
  ];
  const statCards = [["Valid values",stats.count],["Missing values",stats.missing],["Distinct values",stats.distinct],["Sum",fmt(stats.sum)],["Mean",fmt(stats.mean)],["Median",fmt(stats.median)],["Mode",stats.mode ?? "—"],["Minimum / Maximum",`${fmt(stats.min)} / ${fmt(stats.max)}`],["Std. deviation",fmt(stats.std)],["Variance",fmt(stats.variance)]];
  const selectedName = dataset.headers[Number(column)] || "column";

  async function exportFiltered() {
    try {
      const csv = [dataset.headers, ...filteredRows]
        .map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
        .join("\\r\\n");
      const blob = new Blob(["\\uFEFF", csv], { type: "text/csv;charset=utf-8" });
      const fileName = `${dataset.fileName.replace(/\\.csv$/i, "")}_filtered.csv`;

      const resultType = await exportFile(blob, fileName, {
        title: "Filtered CSV export",
        text: `Filtered data exported from ${dataset.fileName}`,
        dialogTitle: "Save or share filtered CSV"
      });
      setNotice(resultType === "shared"
        ? `Filtered CSV created with ${filteredRows.length.toLocaleString()} rows. Choose an app from the Android share sheet to save or share it.`
        : `Filtered CSV exported with ${filteredRows.length.toLocaleString()} rows.`);
    } catch (error) {
      console.error("Filtered CSV export failed:", error);
      setNotice(`Filtered CSV export failed: ${error?.message || "Unknown error"}`);
    }
  }

  return <section className="page-content analytics-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15}/> Back to project</button>
    <div className="page-heading"><div><div className="eyebrow"><i/> ANALYTICS STUDIO</div><h1 className="page-title">Find the story in your data<span>.</span></h1><p>Explore statistics, grouped summaries, relationships and distributions using your local working dataset.</p></div><span className="working-badge">Local analysis</span></div>
    {loading ? <div className="glass-card analytics-empty"><RefreshCw className="spin"/><p>Loading local dataset…</p></div> : <>
      <div className="analytics-summary-grid">
        <div className="glass-card"><small>DATASET</small><b>{dataset.fileName}</b><span>{rows.length.toLocaleString()} rows · {dataset.headers.length} columns</span></div>
        <div className="glass-card"><small>NUMERIC COLUMNS</small><b>{nums.length}</b><span>Detected from current values</span></div>
        <div className="glass-card"><small>ANALYSIS ENGINE</small><b>Local JS</b><span>No server or API calls</span></div>
      </div>
      <div className="analytics-tabs">{tabs.map(([id,label,Icon])=><button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}><Icon size={14}/>{label}</button>)}</div>
      {tab === "overview" && <div className="glass-card analytics-panel"><div className="analytics-panel-head"><div><h2><Activity size={17}/> Dataset overview</h2><p>Quick profile of your current working copy.</p></div></div><div className="analytics-overview-grid"><div><span>Rows</span><b>{rows.length.toLocaleString()}</b></div><div><span>Columns</span><b>{dataset.headers.length}</b></div><div><span>Numeric columns</span><b>{nums.length}</b></div><div><span>Text / other columns</span><b>{dataset.headers.length-nums.length}</b></div></div><h3>Detected numeric fields</h3><div className="analytics-chip-list">{nums.length?nums.map(item=><button key={item.i} onClick={()=>{setColumn(String(item.i));setTab("statistics");}}>{item.h}<span>Open stats</span></button>):<p>No numeric columns were detected. Check data types or clean the dataset first.</p>}</div></div>}
      {tab === "statistics" && <div className="glass-card analytics-panel"><div className="analytics-panel-head"><div><h2><Sigma size={17}/> Descriptive statistics</h2><p>Numeric summaries and missing-value counts for a selected column.</p></div><label className="analytics-select">Column<select value={column} onChange={e=>setColumn(e.target.value)}>{dataset.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}</select></label></div>{!numericSet.has(Number(column))&&<div className="analytics-warning">This column is not predominantly numeric. Numeric statistics include only values that can be parsed as numbers.</div>}<div className="analytics-stat-grid">{statCards.map(([label,value])=><div key={label}><small>{label}</small><b>{value===null?"—":value}</b></div>)}</div><p className="analytics-footnote">Population variance and population standard deviation are shown. Invalid or blank numeric values are excluded from numeric calculations and counted as missing.</p></div>}
      {tab === "group" && <div className="glass-card analytics-panel"><div className="analytics-panel-head"><div><h2><Table2 size={17}/> Group by analysis</h2><p>Summarise records by category or another column.</p></div></div><div className="analytics-controls"><label>Group column<select value={groupColumn} onChange={e=>setGroupColumn(e.target.value)}>{dataset.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}</select></label><label>Aggregation<select value={aggregation} onChange={e=>setAggregation(e.target.value)}><option value="count">Record count</option><option value="sum">Sum</option><option value="average">Average</option><option value="min">Minimum</option><option value="max">Maximum</option></select></label><label className="analytics-check"><input type="checkbox" checked={groupSecondEnabled} onChange={e=>setGroupSecondEnabled(e.target.checked)}/> Add second group column</label>{groupSecondEnabled&&<label>Then group by<select value={groupSecondColumn} onChange={e=>setGroupSecondColumn(e.target.value)}>{dataset.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}</select></label>}{aggregation!=="count"&&<label>Metric column<select value={metricColumn} onChange={e=>setMetricColumn(e.target.value)}>{nums.map(item=><option key={item.i} value={item.i}>{item.h}</option>)}</select></label>}</div><div className="data-table-wrap analytics-table-wrap"><table className="data-table"><thead><tr><th>{dataset.headers[Number(groupColumn)]}{groupSecondEnabled ? ` · ${dataset.headers[Number(groupSecondColumn)]}` : ""}</th><th>{aggregation==="count"?"Records":`${aggregation} · ${dataset.headers[Number(metricColumn)]}`}</th><th>Rows</th></tr></thead><tbody>{grouped.map(item=><tr key={item.name}><td>{item.name}</td><td>{fmt(item.result)}</td><td>{item.records}</td></tr>)}</tbody></table></div><p className="analytics-footnote">Showing {grouped.length.toLocaleString()} groups, ordered by result. Blank group values are grouped as (Blank).</p></div>}
      {tab === "relationship" && <div className="glass-card analytics-panel"><div className="analytics-panel-head"><div><h2><GitBranch size={17}/> Correlation analysis</h2><p>Pearson correlation for pairs of numeric columns.</p></div></div><div className="analytics-controls"><label>Variable X<select value={xColumn} onChange={e=>setXColumn(e.target.value)}>{nums.map(item=><option key={item.i} value={item.i}>{item.h}</option>)}</select></label><label>Variable Y<select value={yColumn} onChange={e=>setYColumn(e.target.value)}>{nums.map(item=><option key={item.i} value={item.i}>{item.h}</option>)}</select></label></div><div className="correlation-result"><small>PEARSON CORRELATION (r)</small><b>{relation.value===null?"Not enough variation":relation.value.toFixed(4)}</b><span>{relation.count} complete numeric pairs</span><p>{relation.value===null?"Choose two numeric columns with at least two valid, varying values.":Math.abs(relation.value)<.2?"Very weak linear relationship":Math.abs(relation.value)<.4?"Weak linear relationship":Math.abs(relation.value)<.7?"Moderate linear relationship":"Strong linear relationship"} · {relation.value>0?"Positive":relation.value<0?"Negative":"No"} association</p></div><p className="analytics-footnote">Correlation measures linear association, not causation. Rows missing either value are excluded.</p></div>}
      {tab === "distribution" && <div className="glass-card analytics-panel"><div className="analytics-panel-head"><div><h2><BarChart3 size={17}/> Distribution & outliers</h2><p>Quartiles, interquartile range and a frequency histogram.</p></div><label className="analytics-select">Column<select value={column} onChange={e=>setColumn(e.target.value)}>{nums.map(item=><option key={item.i} value={item.i}>{item.h}</option>)}</select></label></div><div className="analytics-overview-grid"><div><span>Q1</span><b>{fmt(distribution.q1)}</b></div><div><span>Median</span><b>{fmt(distribution.q2)}</b></div><div><span>Q3</span><b>{fmt(distribution.q3)}</b></div><div><span>IQR</span><b>{fmt(distribution.iqr)}</b></div><div><span>Lower fence</span><b>{fmt(distribution.lower)}</b></div><div><span>Upper fence</span><b>{fmt(distribution.upper)}</b></div><div><span>Outliers</span><b>{distribution.outliers.length}</b></div><div><span>Valid values</span><b>{distribution.count}</b></div></div><h3>Frequency distribution</h3><div className="analytics-histogram">{distribution.bins.map((bin,i)=><div key={i}><div className="analytics-bar-track"><span style={{height:`${Math.max(3,bin.count/Math.max(1,...distribution.bins.map(b=>b.count))*100)}%`}}/></div><b>{bin.count}</b><small>{bin.label}</small></div>)}</div><p className="analytics-footnote">Outliers use the 1.5 × IQR rule. Histogram uses up to 10 equal-width bins. This is a statistical flag, not automatic removal.</p></div>}
      {tab === "query" && <div className="glass-card analytics-panel"><div className="analytics-panel-head"><div><h2><Filter size={17}/> Filter & query</h2><p>Build a local filter without modifying the saved working dataset.</p></div><button className="secondary-button compact" onClick={exportFiltered}><Download size={14}/> Export filtered CSV</button></div><div className="analytics-controls"><label>Column<select value={filterColumn} onChange={e=>setFilterColumn(e.target.value)}>{dataset.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}</select></label><label>Condition<select value={filterOperator} onChange={e=>setFilterOperator(e.target.value)}><option value="contains">Contains</option><option value="starts">Starts with</option><option value="equals">Equals</option><option value="not-equals">Does not equal</option><option value="gt">Greater than</option><option value="gte">Greater than or equal</option><option value="lt">Less than</option><option value="lte">Less than or equal</option><option value="empty">Is empty</option><option value="not-empty">Is not empty</option></select></label>{!['empty','not-empty'].includes(filterOperator)&&<label>Value<input value={filterValue} onChange={e=>setFilterValue(e.target.value)} placeholder="Enter comparison value"/></label>}</div><div className="analytics-second-rule"><label><input type="checkbox" checked={secondEnabled} onChange={e=>setSecondEnabled(e.target.checked)}/> Add a second condition</label>{secondEnabled&&<><label>Combine<select value={logic} onChange={e=>setLogic(e.target.value)}><option value="and">AND (both must match)</option><option value="or">OR (either can match)</option></select></label><label>Second column<select value={secondColumn} onChange={e=>setSecondColumn(e.target.value)}>{dataset.headers.map((h,i)=><option key={i} value={i}>{h}</option>)}</select></label><label>Condition<select value={secondOperator} onChange={e=>setSecondOperator(e.target.value)}><option value="contains">Contains</option><option value="equals">Equals</option><option value="not-equals">Does not equal</option><option value="gt">Greater than</option><option value="gte">Greater than or equal</option><option value="lt">Less than</option><option value="lte">Less than or equal</option><option value="empty">Is empty</option><option value="not-empty">Is not empty</option></select></label>{!['empty','not-empty'].includes(secondOperator)&&<label>Value<input value={secondValue} onChange={e=>setSecondValue(e.target.value)} placeholder="Second comparison value"/></label>}</>}</div><label className="analytics-search"><Search size={15}/><input value={filterSearch} onChange={e=>setFilterSearch(e.target.value)} placeholder="Optional: also search across all columns"/></label><div className="analytics-filter-result"><b>{filteredRows.length.toLocaleString()}</b><span>matching rows out of {rows.length.toLocaleString()}</span></div><div className="data-table-wrap analytics-table-wrap"><table className="data-table"><thead><tr><th>#</th>{dataset.headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{filteredRows.slice(0,100).map((row,i)=><tr key={i}><td>{i+1}</td>{row.map((v,j)=><td key={j}>{String(v??"")||"—"}</td>)}</tr>)}</tbody></table></div><p className="analytics-footnote">Preview limited to first 100 matching rows. Filters are temporary and do not alter your dataset. Export creates a separate filtered CSV.</p></div>}
    </>}
    {notice&&<div className="explorer-notice">{notice}</div>}
    <p className="analytics-footnote analytics-disclaimer">All calculations run locally in this browser against the current working copy. This first analytics release loads the dataset into memory; very large files may be limited by available device memory. DuckDB-Wasm / SQL execution and worker-based processing remain future performance upgrades.</p>
  </section>;
}
