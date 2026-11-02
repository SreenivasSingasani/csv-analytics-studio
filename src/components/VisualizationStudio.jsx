import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BarChart3, Download, Plus, Trash2, Save, PieChart, LineChart, ScatterChart, Image, FileSpreadsheet, LayoutDashboard, GripVertical } from "lucide-react";
import { getAllDatasetRows, getSavedCharts, saveChart, deleteSavedChart } from "../db/database.js";
import { exportFile } from "../platform/exportFile.js";

const COLORS = ["#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#64748b", "#3b82f6", "#ef4444"];
const number = value => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(String(value).trim().replace(/[₹$€£,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const fmt = value => Number.isFinite(value) ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value) : "—";
const escapeCsv = value => `"${String(value ?? "").replaceAll('"', '""')}"`;

function buildSeries(rows, config) {
  const xi = Number(config.xColumn), yi = Number(config.yColumn);
  if (config.type === "histogram") {
    const values = rows.map(row => number(row[yi])).filter(v => v !== null);
    if (!values.length) return [];
    const min = Math.min(...values), max = Math.max(...values);
    const count = Math.min(12, Math.max(4, Math.ceil(Math.sqrt(values.length))));
    const width = (max - min || 1) / count;
    const bins = Array.from({ length: count }, (_, i) => ({ label: `${fmt(min + i * width)}–${fmt(i === count - 1 ? max : min + (i + 1) * width)}`, value: 0 }));
    values.forEach(value => bins[Math.min(count - 1, Math.floor((value - min) / width))].value++);
    return bins;
  }
  if (config.type === "box") {
    const values = rows.map(row => number(row[yi])).filter(v => v !== null).sort((a, b) => a - b);
    if (!values.length) return [];
    const q = p => { const pos = (values.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos); return values[lo] + (values[hi] - values[lo]) * (pos - lo); };
    return [{ label: config.title || "Distribution", min: values[0], q1: q(.25), median: q(.5), q3: q(.75), max: values.at(-1), value: q(.5) }];
  }
  if (config.type === "scatter") return rows.map((row, i) => ({ label: String(row[xi] ?? `Row ${i + 1}`), x: number(row[xi]), value: number(row[yi]) })).filter(point => point.x !== null && point.value !== null).slice(0, 1500);
  if (config.type === "pie" || config.type === "donut") {
    const groups = new Map();
    rows.forEach(row => { const key = String(row[xi] ?? "(Blank)").trim() || "(Blank)"; groups.set(key, (groups.get(key) || 0) + (config.aggregate === "sum" ? (number(row[yi]) || 0) : 1)); });
    return [...groups].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 12);
  }
  const groups = new Map();
  rows.forEach((row, i) => {
    const label = String(row[xi] ?? `Row ${i + 1}`).trim() || "(Blank)";
    const value = number(row[yi]);
    if (!groups.has(label)) groups.set(label, { values: [], records: 0 });
    const group = groups.get(label); group.records++;
    if (value !== null) group.values.push(value);
  });
  return [...groups].map(([label, group]) => ({ label, value: config.aggregate === "sum" ? group.values.reduce((a, b) => a + b, 0) : config.aggregate === "average" ? (group.values.length ? group.values.reduce((a, b) => a + b, 0) / group.values.length : 0) : group.records })).sort((a, b) => b.value - a.value).slice(0, config.type === "line" || config.type === "area" ? 80 : 30);
}

function ChartView({ config, rows, compact = false }) {
  const points = useMemo(() => buildSeries(rows, config), [rows, config]);
  const width = 760, height = compact ? 230 : 320, left = 48, right = 18, top = 18, bottom = 48;
  const plotW = width - left - right, plotH = height - top - bottom;
  const max = Math.max(1, ...points.map(p => p.value || 0));
  const min = Math.min(0, ...points.map(p => p.value || 0));
  const range = max - min || 1;
  const y = v => top + plotH - ((v - min) / range) * plotH;
  const x = i => left + (points.length <= 1 ? plotW / 2 : i * plotW / (points.length - 1));
  if (!points.length) return <div className="viz-empty">No plottable values. Choose a suitable column or chart type.</div>;
  if (config.type === "pie" || config.type === "donut") {
    const total = points.reduce((sum, p) => sum + p.value, 0) || 1;
    let angle = -Math.PI / 2;
    const arcs = points.map((point, i) => {
      const start = angle, end = angle + point.value / total * Math.PI * 2; angle = end;
      const r = 105, cx = 185, cy = 145;
      const polar = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
      const [sx, sy] = polar(start), [ex, ey] = polar(end);
      const large = end - start > Math.PI ? 1 : 0;
      const path = `M ${cx} ${cy} L ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey} Z`;
      return <path key={point.label} d={path} fill={COLORS[i % COLORS.length]} stroke="var(--surface)" strokeWidth="2"><title>{point.label}: {fmt(point.value)} ({(point.value / total * 100).toFixed(1)}%)</title></path>;
    });
    return <div className="viz-pie-wrap"><svg viewBox="0 0 370 290" role="img" aria-label={`${config.type} chart`}>{arcs}{config.type === "donut" && <><circle cx="185" cy="145" r="57" fill="var(--surface)"/><text x="185" y="141" textAnchor="middle" className="viz-pie-total">{fmt(total)}</text><text x="185" y="160" textAnchor="middle" className="viz-pie-sub">Total</text></>}</svg><div className="viz-legend">{points.map((p, i) => <span key={p.label}><i style={{ background: COLORS[i % COLORS.length] }}/><b>{p.label}</b><small>{fmt(p.value)}</small></span>)}</div></div>;
  }
  if (config.type === "box") {
    const p = points[0], scaleMin = p.min, scaleMax = p.max, scale = v => left + ((v - scaleMin) / (scaleMax - scaleMin || 1)) * plotW;
    return <svg className="viz-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Box plot"><line x1={left} x2={width-right} y1={height/2} y2={height/2} stroke="var(--border)"/><line x1={scale(p.min)} x2={scale(p.max)} y1={height/2} y2={height/2} stroke="var(--accent)" strokeWidth="3"/><rect x={scale(p.q1)} y={height/2-28} width={Math.max(2,scale(p.q3)-scale(p.q1))} height="56" rx="7" fill="rgba(139,92,246,.22)" stroke="var(--accent)"/><line x1={scale(p.median)} x2={scale(p.median)} y1={height/2-28} y2={height/2+28} stroke="var(--text)" strokeWidth="3"/>{[p.min,p.q1,p.median,p.q3,p.max].map((v,i)=><text key={i} x={scale(v)} y={height/2+55} textAnchor="middle" className="viz-axis-label">{fmt(v)}</text>)}</svg>;
  }
  if (config.type === "scatter") {
    const xs = points.map(p => p.x), ys = points.map(p => p.value), xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = Math.min(...ys), ymax = Math.max(...ys);
    return <svg className="viz-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Scatter plot">{[0,1,2,3,4].map(i=><line key={i} x1={left} x2={width-right} y1={top+i*plotH/4} y2={top+i*plotH/4} stroke="var(--border)"/>)}{points.map((p,i)=><circle key={i} cx={left+((p.x-xmin)/(xmax-xmin||1))*plotW} cy={top+plotH-((p.value-ymin)/(ymax-ymin||1))*plotH} r="4" fill={COLORS[0]} opacity=".72"><title>{p.label}: {fmt(p.x)}, {fmt(p.value)}</title></circle>)}</svg>;
  }
  const isBar = config.type === "bar";
  const isColumn = config.type === "column" || config.type === "histogram";
  if (isBar) {
    const band = plotH / points.length, barH = band * .66;
    return <svg className="viz-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Bar chart">{points.map((p,i)=>{const yy=top+i*band+(band-barH)/2;return <g key={p.label}><text x={left-8} y={yy+barH*.72} textAnchor="end" className="viz-axis-label">{p.label.slice(0,18)}</text><rect x={left} y={yy} width={Math.max(1,(p.value-min)/range*plotW)} height={barH} rx="5" fill={COLORS[i%COLORS.length]}><title>{p.label}: {fmt(p.value)}</title></rect></g>;})}</svg>;
  }
  const barW = Math.max(5, Math.min(44, plotW / points.length * .62));
  const path = points.map((p,i)=>`${i===0?"M":"L"} ${x(i)} ${y(p.value)}`).join(" ");
  return <svg className="viz-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${config.type} chart`}>{[0,1,2,3,4].map(i=><g key={i}><line x1={left} x2={width-right} y1={top+i*plotH/4} y2={top+i*plotH/4} stroke="var(--border)"/><text x={left-8} y={top+i*plotH/4+3} textAnchor="end" className="viz-axis-label">{fmt(max-(max-min)*i/4)}</text></g>)}{(isColumn || config.type === "histogram") && points.map((p,i)=><rect key={p.label} x={x(i)-barW/2} y={y(p.value)} width={barW} height={Math.max(1,top+plotH-y(p.value))} rx="4" fill={COLORS[i%COLORS.length]}><title>{p.label}: {fmt(p.value)}</title></rect>)}{(config.type === "line" || config.type === "area") && <>{config.type === "area" && <path d={`${path} L ${x(points.length-1)} ${top+plotH} L ${x(0)} ${top+plotH} Z`} fill="rgba(139,92,246,.15)"/>}<path d={path} fill="none" stroke={COLORS[0]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{points.map((p,i)=><circle key={p.label} cx={x(i)} cy={y(p.value)} r="4" fill={COLORS[0]}><title>{p.label}: {fmt(p.value)}</title></circle>)}</>}{points.map((p,i)=> <text key={p.label} x={x(i)} y={height-15} textAnchor="middle" className="viz-axis-label">{p.label.length>11?`${p.label.slice(0,10)}…`:p.label}</text>)}</svg>;
}

export default function VisualizationStudio({ dataset, onBack }) {
  const [rows, setRows] = useState([]), [saved, setSaved] = useState([]), [busy, setBusy] = useState(true), [notice, setNotice] = useState("");
  const [title, setTitle] = useState("Customer analysis"), [type, setType] = useState("bar"), [xColumn, setXColumn] = useState("3"), [yColumn, setYColumn] = useState("4"), [aggregate, setAggregate] = useState("count");
  const [chartConfigs, setChartConfigs] = useState([]), [dragIndex, setDragIndex] = useState(null);
  const [pngScale, setPngScale] = useState("2");
  const [pngBackground, setPngBackground] = useState("white");
  const previewRef = useRef(null);
  useEffect(() => { let alive = true; setBusy(true); Promise.all([getAllDatasetRows(dataset.id), getSavedCharts(dataset.id)]).then(([data, charts]) => { if (!alive) return; setRows(data); setSaved(charts); if (dataset.headers?.length) { const cat = dataset.headers.findIndex((_,i)=>!dataset.columnTypes?.[i] || !/integer|decimal/i.test(dataset.columnTypes[i].type)); const num = dataset.columnTypes?.findIndex(c=>/integer|decimal/i.test(c.type)) ?? -1; setXColumn(String(cat >= 0 ? cat : 0)); setYColumn(String(num >= 0 ? num : Math.min(1,dataset.headers.length-1))); } }).catch(e=>setNotice(`Could not load chart data: ${e.message}`)).finally(()=>setBusy(false)); return ()=>{alive=false;}; }, [dataset.id]);
  const config = useMemo(()=>({ id:"preview", title, type, xColumn, yColumn, aggregate }),[title,type,xColumn,yColumn,aggregate]);
  const previewPoints = useMemo(()=>buildSeries(rows,config),[rows,config]);
  const numericTypes = ["column","line","area","scatter","histogram","box"];
  const makeCsv = (cfg, data) => { const lines = [["Label","Value"], ...data.map(p=>[p.label,p.value])]; return lines.map(line=>line.map(escapeCsv).join(",")).join("\n"); };
  async function saveCurrent() { const item = { datasetId: dataset.id, title: title.trim() || "Untitled chart", type, xColumn, yColumn, aggregate, createdAt: new Date().toISOString() }; await saveChart(item); setSaved(await getSavedCharts(dataset.id)); setNotice("Chart saved to this dataset's local dashboard."); }
  async function removeChart(id) { await deleteSavedChart(id); setSaved(await getSavedCharts(dataset.id)); }
  function addToDashboard() { setChartConfigs(current=>[...current,{...config,id:`chart-${Date.now()}-${current.length}`}]); setNotice("Chart added to the dashboard canvas. Save it to keep it after refresh."); }
  async function exportCsv(cfg) {
    try {
      const data=buildSeries(rows,cfg);
      const blob=new Blob([makeCsv(cfg,data)],{type:"text/csv;charset=utf-8"});
      const fileName=`${(cfg.title||"chart-data").replace(/[^a-z0-9-_]+/gi,"-")}.csv`;
      const resultType=await exportFile(blob,fileName,{title:"Chart data CSV",dialogTitle:"Save or share chart data"});
      setNotice(resultType==="shared"?"Chart data CSV created. Choose an app from the Android share sheet.":"Chart data CSV exported.");
    } catch (error) {
      setNotice(`Chart CSV export failed: ${error?.message||"Unknown error"}`);
    }
  }
  function safeFileName(value) { return (value || "chart").trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "chart"; }
  function prepareSvg(svg, cfg = config) {
    const clone = svg.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const rootStyle = getComputedStyle(document.documentElement);
    const resolveVars = value => String(value).replace(/var\\((--[\\w-]+)(?:,\\s*([^)]*))?\\)/g, (_, key, fallback) => rootStyle.getPropertyValue(key).trim() || fallback || "inherit");
    const sourceNodes = [svg, ...svg.querySelectorAll("*")];
    const cloneNodes = [clone, ...clone.querySelectorAll("*")];
    const properties = ["fill","stroke","color","font-family","font-size","font-weight","text-anchor","opacity","stroke-width","stroke-linecap","stroke-linejoin"];
    sourceNodes.forEach((node, index) => {
      const target = cloneNodes[index];
      const computed = getComputedStyle(node);
      const inline = properties.map(prop => `${prop}:${resolveVars(computed.getPropertyValue(prop))}`).join(";");
      target.setAttribute("style", `${target.getAttribute("style") || ""};${inline}`);
      [...target.attributes].forEach(attr => target.setAttribute(attr.name, resolveVars(attr.value)));
    });
    const box = svg.viewBox?.baseVal;
    const chartWidth = box?.width || Number(svg.getAttribute("width")) || 760;
    const chartHeight = box?.height || Number(svg.getAttribute("height")) || 320;
    const isPie = cfg.type === "pie" || cfg.type === "donut";
    const series = isPie ? buildSeries(rows, cfg) : [];
    const hasLegend = isPie && series.length > 0;
    const titleBand = 48;
    const legendWidth = hasLegend ? 300 : 0;
    const width = hasLegend ? Math.max(700, chartWidth + legendWidth) : chartWidth;
    const height = hasLegend ? Math.max(chartHeight, Math.min(520, series.length * 25 + 50)) + titleBand : chartHeight + titleBand;
    const content = document.createElementNS("http://www.w3.org/2000/svg", "g");
    content.setAttribute("transform", `translate(0 ${titleBand})`);
    while (clone.firstChild) content.appendChild(clone.firstChild);
    const heading = document.createElementNS("http://www.w3.org/2000/svg", "text");
    heading.setAttribute("x", String(width / 2)); heading.setAttribute("y", "30");
    heading.setAttribute("text-anchor", "middle");
    heading.setAttribute("font-family", 'Inter, Arial, sans-serif');
    heading.setAttribute("font-size", "22"); heading.setAttribute("font-weight", "700");
    // Match text contrast to the exported canvas background. In dark mode,
    // --text is near-white; using it on a white PNG makes titles disappear.
    const exportTextColor = pngBackground === "white"
      ? "#222222"
      : (rootStyle.getPropertyValue("--text").trim() || "#222222");
    heading.setAttribute("fill", exportTextColor);
    heading.textContent = cfg.title || "Untitled chart";
    clone.appendChild(heading); clone.appendChild(content);
    if (hasLegend) {
      const legend = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const legendX = chartWidth + 8;
      series.forEach((item, index) => {
        const y = titleBand + 34 + index * 25;
        const swatch = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        swatch.setAttribute("x", String(legendX)); swatch.setAttribute("y", String(y - 10));
        swatch.setAttribute("width", "12"); swatch.setAttribute("height", "12");
        swatch.setAttribute("rx", "4"); swatch.setAttribute("fill", COLORS[index % COLORS.length]);
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
        label.setAttribute("x", String(legendX + 22)); label.setAttribute("y", String(y));
        label.setAttribute("font-family", 'Inter, Arial, sans-serif'); label.setAttribute("font-size", "13");
        // Explicitly use a high-contrast color for white-background exports.
        // The app's dark-theme text token is white and was invisible in PNGs.
        label.setAttribute("fill", exportTextColor);
        label.textContent = item.label.length > 30 ? `${item.label.slice(0, 27)}…` : item.label;
        const value = document.createElementNS("http://www.w3.org/2000/svg", "text");
        value.setAttribute("x", String(width - 18)); value.setAttribute("y", String(y));
        value.setAttribute("text-anchor", "end"); value.setAttribute("font-family", 'Inter, Arial, sans-serif');
        value.setAttribute("font-size", "13"); value.setAttribute("fill", rootStyle.getPropertyValue("--muted").trim() || "#666");
        value.textContent = fmt(item.value);
        legend.appendChild(swatch); legend.appendChild(label); legend.appendChild(value);
      });
      clone.appendChild(legend);
    }
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    return { clone, width, height };
  }

  async function rasterizeSvg(svg, cfg, scale = 2) {
    if (!svg) { setNotice("There is no chart to export yet."); return; }
    let objectUrl;
    try {
      const { clone, width, height } = prepareSvg(svg, cfg);
      const serialized = new XMLSerializer().serializeToString(clone);
      const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
      objectUrl = URL.createObjectURL(svgBlob);
      const image = new window.Image();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error("Could not render this chart as PNG. Try SVG export instead."));
        image.src = objectUrl;
      });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas export is unavailable in this browser.");
      if (pngBackground === "white") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pngBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG encoding failed. Please try again.")), "image/png");
      });
      const fileName = `${safeFileName(cfg.title)}-${scale}x.png`;

      const resultType = await exportFile(pngBlob, fileName, {
        title: cfg.title || "CSV Analytics Studio chart",
        text: "Chart exported from CSV Analytics Studio",
        dialogTitle: "Save or share chart PNG"
      });
      setNotice(resultType === "shared"
        ? "PNG created. Choose an app from the Android share sheet to save or share it."
        : `PNG exported at ${scale}× resolution.`);
    } catch (error) {
      setNotice(`PNG export failed: ${error?.message || "Unknown error"}`);
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }
  function exportPreviewPng() { return rasterizeSvg(previewRef.current?.querySelector(".viz-chart-render svg"), config, Number(pngScale)); }
  async function exportSvg(svg = previewRef.current?.querySelector(".viz-chart-render svg"), cfg = config) {
    if (!svg) { setNotice("There is no chart to export yet."); return; }
    try {
      const { clone } = prepareSvg(svg, cfg);
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
      const resultType = await exportFile(blob, `${safeFileName(cfg.title)}.svg`, {title:cfg.title||"Chart SVG",dialogTitle:"Save or share chart SVG"});
      setNotice(resultType==="shared"?"SVG created. Choose an app from the Android share sheet.":"SVG exported.");
    } catch (error) { setNotice(`SVG export failed: ${error?.message||"Unknown error"}`); }
  }
  if (busy) return <section className="page-content analytics-page"><div className="analytics-empty glass-card">Loading visualization workspace…</div></section>;
  return <section className="page-content analytics-page visualization-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15}/> Back to dataset</button>
    <div className="page-heading"><div><div className="eyebrow"><i/> PHASE 7 · VISUALIZATION STUDIO</div><h1 className="page-title">Visualization Studio<span>.</span></h1><p>Build interactive charts and save them to a local dashboard for {dataset.fileName}.</p></div><div className="viz-heading-meta"><span><b>{rows.length.toLocaleString()}</b> rows</span><span><b>{dataset.headers?.length || 0}</b> columns</span></div></div>
    {notice && <div className="analytics-filter-result">{notice}</div>}
    <div className="viz-layout">
      <aside className="glass-card viz-builder">
        <div className="analytics-panel-head"><div><h2><BarChart3 size={17}/> Chart Builder</h2><p>Choose the chart and the fields to visualise.</p></div></div>
        <label className="cleaning-field">Chart title<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={70}/></label>
        <label className="cleaning-field">Chart type<select value={type} onChange={e=>setType(e.target.value)}>{[["bar","Horizontal bar"],["column","Column"],["line","Line"],["area","Area"],["pie","Pie"],["donut","Donut"],["scatter","Scatter plot"],["histogram","Histogram"],["box","Box plot"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
        <label className="cleaning-field">{type==="pie"||type==="donut"||type==="bar"||type==="column"?"Category / X axis":"X axis"}<select value={xColumn} onChange={e=>setXColumn(e.target.value)}>{dataset.headers.map((h,i)=><option value={i} key={i}>{h}</option>)}</select></label>
        <label className="cleaning-field">{type==="scatter"?"Y axis":"Value / Y axis"}<select value={yColumn} onChange={e=>setYColumn(e.target.value)}>{dataset.headers.map((h,i)=><option value={i} key={i}>{h}</option>)}</select></label>
        {(type==="bar"||type==="column"||type==="pie"||type==="donut") && <label className="cleaning-field">Aggregation<select value={aggregate} onChange={e=>setAggregate(e.target.value)}><option value="count">Count records</option><option value="sum">Sum values</option><option value="average">Average values</option></select></label>}
        <div className="viz-builder-actions"><button className="primary-button" onClick={saveCurrent}><Save size={14}/> Save chart</button><button className="secondary-button" onClick={addToDashboard}><Plus size={14}/> Add to canvas</button></div>
        <p className="cleaning-safe-note">Charts use the current working dataset stored locally. The original CSV is not modified.</p>
      </aside>
      <div className="viz-main">
        <div className="glass-card viz-preview-card" ref={previewRef}><div className="analytics-panel-head"><div><h2>{title || "Untitled chart"}</h2><p>{dataset.headers[Number(xColumn)]} · {dataset.headers[Number(yColumn)]} · {previewPoints.length.toLocaleString()} plotted categories/points</p></div><div className="viz-export-actions">
            <label className="viz-export-select">PNG <select value={pngScale} onChange={e=>setPngScale(e.target.value)} aria-label="PNG resolution"><option value="2">2×</option><option value="3">3×</option></select></label>
            <label className="viz-export-select">Background <select value={pngBackground} onChange={e=>setPngBackground(e.target.value)} aria-label="PNG background"><option value="white">White</option><option value="transparent">Transparent</option></select></label>
            <button className="secondary-button" onClick={exportPreviewPng}><Download size={14}/> Download PNG</button>
            <button className="secondary-button" onClick={()=>exportSvg()}><Image size={14}/> Export SVG</button>
          </div></div><div className="viz-chart-render"><ChartView config={config} rows={rows}/></div><div className="viz-preview-footer"><span>Hover over chart marks for values</span><button className="text-button" onClick={()=>exportCsv(config)}><Download size={13}/> Export chart data CSV</button></div></div>
        <div className="glass-card viz-dashboard"><div className="analytics-panel-head"><div><h2><LayoutDashboard size={17}/> Dashboard Canvas</h2><p>Arrange charts and keep a visual workspace for this dataset.</p></div><span className="viz-count">{chartConfigs.length} unsaved · {saved.length} saved</span></div>
          {chartConfigs.length ? <div className="viz-canvas-grid">{chartConfigs.map((cfg,index)=><article className="viz-canvas-card" key={cfg.id} draggable onDragStart={()=>setDragIndex(index)} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(dragIndex===null||dragIndex===index)return;setChartConfigs(current=>{const next=[...current], [moved]=next.splice(dragIndex,1);next.splice(index,0,moved);return next;});setDragIndex(null);}}><header><GripVertical size={14}/><b>{cfg.title}</b><button className="icon-button" onClick={e=>rasterizeSvg(e.currentTarget.closest(".viz-canvas-card")?.querySelector(".viz-chart-render svg"),cfg,2)} aria-label={`Download ${cfg.title} as PNG`} title="Download PNG"><Download size={14}/></button><button className="icon-button" onClick={()=>setChartConfigs(current=>current.filter(c=>c.id!==cfg.id))} aria-label="Remove chart"><Trash2 size={14}/></button></header><div className="viz-chart-render"><ChartView config={cfg} rows={rows} compact/></div></article>)}</div> : <div className="viz-empty"><LayoutDashboard size={22}/><b>Your dashboard canvas is empty</b><span>Build a chart and select “Add to canvas” to start arranging your dashboard.</span></div>}
        </div>
      </div>
    </div>
    <div className="glass-card viz-saved"><div className="analytics-panel-head"><div><h2><Save size={16}/> Saved charts</h2><p>Saved chart definitions are stored in this browser and linked to this dataset.</p></div></div>{saved.length ? <div className="viz-saved-list">{saved.map(item=><div key={item.id}><span><b>{item.title}</b><small>{item.type} · {new Date(item.createdAt).toLocaleString()}</small></span><div><button className="text-button" onClick={()=>{setTitle(item.title);setType(item.type);setXColumn(item.xColumn);setYColumn(item.yColumn);setAggregate(item.aggregate);}}><PencilIcon/> Edit</button><button className="icon-button" onClick={()=>removeChart(item.id)} aria-label="Delete saved chart"><Trash2 size={14}/></button></div></div>)}</div>:<div className="viz-empty">No saved charts yet.</div>}</div>
    <p className="analytics-footnote">Chart calculations and PNG rendering run locally in your browser. PNG export supports 2×/3× resolution with white or transparent backgrounds; pie/donut exports include the category legend and values. SVG and chart-data CSV exports remain available. For very large datasets, browser memory and rendering performance may vary.</p>
  </section>;
}
function PencilIcon(){return <BarChart3 size={13}/>}
