import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Sparkles, AlertTriangle, TrendingUp, TrendingDown, Activity, ShieldCheck, RefreshCw, Download, Info } from "lucide-react";
import { getAllDatasetRows } from "../db/database.js";
import { exportFile } from "../platform/exportFile.js";

const clean = value => String(value ?? "").trim();
const numeric = value => {
  const raw = clean(value).replace(/[₹$€£,\s]/g, "");
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};
const fmt = value => value == null || !Number.isFinite(value) ? "—" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
// Strict date parsing: Date.parse("19") and Date.parse("2024") can produce
// plausible but completely false dates, so numeric-looking values are rejected.
const parseStrictDate = value => {
  const raw = clean(value);
  if (!raw || /^[-+]?\d+(?:[.,]\d+)?$/.test(raw)) return null;
  let year, month, day;
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (match) [, year, month, day] = match;
  else {
    match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const a = Number(match[1]), b = Number(match[2]);
      // Treat slash dates as DD/MM/YYYY when the first component cannot be a month;
      // otherwise use DD/MM/YYYY for consistency with the supplied test dataset.
      [, day, month, year] = match;
      if (a <= 12 && b > 12) { month = String(a); day = String(b); }
    } else return null;
  }
  const y = Number(year), m = Number(month), d = Number(day);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
};
const quantile = (sorted, p) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
const average = values => values.length ? values.reduce((a,b)=>a+b,0) / values.length : null;
const modeOf = values => {
  const counts = new Map();
  values.forEach(v => counts.set(v, (counts.get(v) || 0) + 1));
  return [...counts].sort((a,b)=>b[1]-a[1])[0] || null;
};
const correlation = (a,b) => {
  const pairs = a.map((v,i)=>[v,b[i]]).filter(([x,y])=>x!==null&&y!==null);
  if (pairs.length < 3) return null;
  const mx=average(pairs.map(p=>p[0])), my=average(pairs.map(p=>p[1]));
  const numerator=pairs.reduce((s,[x,y])=>s+(x-mx)*(y-my),0);
  const dx=Math.sqrt(pairs.reduce((s,[x])=>s+(x-mx)**2,0));
  const dy=Math.sqrt(pairs.reduce((s,[,y])=>s+(y-my)**2,0));
  return dx && dy ? numerator/(dx*dy) : null;
};

function analyse(headers, rows) {
  const numericColumns = headers.map((name,index)=>{
    const values=rows.map(r=>numeric(r[index]));
    const valid=values.filter(v=>v!==null).sort((a,b)=>a-b);
    const q1=quantile(valid,.25), median=quantile(valid,.5), q3=quantile(valid,.75), iqr=q3-q1;
    const lower=q1-1.5*iqr, upper=q3+1.5*iqr;
    const outliers=valid.filter(v=>v<lower||v>upper);
    return {name,index,values,valid,min:valid[0]??null,max:valid.at(-1)??null,mean:average(valid),median,q1,q3,iqr,outliers,missing:rows.length-valid.length};
  }).filter(c=>c.valid.length>=3 && c.valid.length/Math.max(1,rows.length)>=.65);
  const columns=headers.map((name,index)=>{
    const values=rows.map(r=>clean(r[index]));
    const nonEmpty=values.filter(Boolean);
    const counts=new Map();
    nonEmpty.forEach(v=>counts.set(v,(counts.get(v)||0)+1));
    const top=[...counts].sort((a,b)=>b[1]-a[1]).slice(0,5);
    return {name,index,missing:rows.length-nonEmpty.length,distinct:counts.size,top,mode:modeOf(nonEmpty)};
  });
  const pairs=[];
  for(let i=0;i<numericColumns.length;i++) for(let j=i+1;j<numericColumns.length;j++){
    const a=numericColumns[i], b=numericColumns[j], value=correlation(a.values,b.values);
    if(value!==null) pairs.push({a:a.name,b:b.name,value});
  }
  pairs.sort((a,b)=>Math.abs(b.value)-Math.abs(a.value));
  const totalCells=rows.length*headers.length;
  const missing=columns.reduce((s,c)=>s+c.missing,0);
  const rowKeys=new Map();
  rows.forEach(row=>{const key=JSON.stringify(row);rowKeys.set(key,(rowKeys.get(key)||0)+1);});
  const duplicateRows=[...rowKeys.values()].reduce((s,n)=>s+Math.max(0,n-1),0);
  const dates=headers.map((name,index)=>({name,index,parsed:rows.map(r=>parseStrictDate(r[index]))}))
    .filter(c=>c.parsed.filter(Boolean).length>=Math.max(3,rows.length*.5));
  const trends=[];
  dates.forEach(dateCol=>numericColumns.filter(c=>c.index!==dateCol.index).forEach(numCol=>{
    const buckets=new Map();
    rows.forEach((row,rowIndex)=>{
      const parsed=dateCol.parsed[rowIndex], value=numeric(row[numCol.index]);
      if(!parsed||value===null)return;
      const key=`${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,"0")}`;
      if(!buckets.has(key))buckets.set(key,[]);
      buckets.get(key).push(value);
    });
    const points=[...buckets].sort((a,b)=>a[0].localeCompare(b[0])).map(([period,values])=>({period,average:average(values),count:values.length}));
    if(points.length>=3){
      const first=points[0].average,last=points.at(-1).average;
      const change=first===0?null:(last-first)/Math.abs(first)*100;
      trends.push({dateColumn:dateCol.name,valueColumn:numCol.name,points,change});
    }
  }));
  return {numericColumns,columns,pairs,totalCells,missing,duplicateRows,completeness:totalCells?100*(totalCells-missing)/totalCells:0,dates,trends};
}

function buildFindings(result, rows) {
  const findings=[];
  const missingPct=result.totalCells?result.missing/result.totalCells*100:0;
  if(missingPct>0) findings.push({kind:"warning",title:"Missing values need attention",body:`${fmt(result.missing)} cells (${fmt(missingPct)}%) are empty across the dataset. Review the columns with the highest missing counts before analysis.`,icon:"quality"});
  else findings.push({kind:"good",title:"No missing cells detected",body:"Every imported cell contains a value. This is a useful starting point for analysis.",icon:"quality"});
  if(result.duplicateRows>0) findings.push({kind:"warning",title:"Duplicate records detected",body:`${fmt(result.duplicateRows)} repeated row${result.duplicateRows===1?"":"s"} were found by exact full-row comparison. Confirm whether these represent duplicate entries or legitimate repeated events.`,icon:"duplicates"});
  else findings.push({kind:"good",title:"No exact duplicate rows",body:"The dataset contains no exact full-row duplicates.",icon:"duplicates"});
  result.numericColumns.forEach(c=>{
    const pct=c.valid.length?c.outliers.length/c.valid.length*100:0;
    if(c.outliers.length) findings.push({kind:pct>=5?"warning":"info",title:`Potential outliers in ${c.name}`,body:`${c.outliers.length} value${c.outliers.length===1?"":"s"} fall outside the 1.5×IQR fences (${fmt(c.q1-1.5*c.iqr)} to ${fmt(c.q3+1.5*c.iqr)}). These are flags for review, not proof of errors.`,icon:"outliers"});
  });
  result.trends.slice(0,3).forEach(t=>{
    if(t.change===null)return;
    const direction=t.change>2?"increased":t.change< -2?"decreased":"remained broadly stable";
    findings.push({kind:"info",title:`${t.valueColumn} ${direction} across periods`,body:`The monthly average moved from ${fmt(t.points[0].average)} in ${t.points[0].period} to ${fmt(t.points.at(-1).average)} in ${t.points.at(-1).period} (${t.change>0?"+":""}${fmt(t.change)}%). This is a descriptive comparison, not a forecast.`,icon:"trend"});
  });
  result.pairs.slice(0,3).forEach(p=>{
    const strength=Math.abs(p.value)>=.7?"strong":Math.abs(p.value)>=.4?"moderate":"weak";
    findings.push({kind:"info",title:`${strength[0].toUpperCase()+strength.slice(1)} ${p.value>=0?"positive":"negative"} association`,body:`${p.a} and ${p.b} have a Pearson correlation of ${p.value.toFixed(3)} using paired numeric values. Correlation does not establish causation.`,icon:"correlation"});
  });
  const topMissing=[...result.columns].sort((a,b)=>b.missing-a.missing).find(c=>c.missing>0);
  if(topMissing) findings.push({kind:"action",title:`Review ${topMissing.name}`,body:`This column has ${topMissing.missing} missing values. Consider whether to fill, exclude, or investigate them based on the meaning of the field.`,icon:"action"});
  const mostDistinct=[...result.columns].filter(c=>c.distinct>1).sort((a,b)=>b.distinct-a.distinct)[0];
  if(mostDistinct) findings.push({kind:"info",title:`${mostDistinct.name} has high variety`,body:`There are ${mostDistinct.distinct} distinct non-empty values. It may be an identifier or a high-cardinality field; grouping by it may create many small groups.`,icon:"variety"});
  if(!findings.length) findings.push({kind:"info",title:"Not enough variation for deeper findings",body:"Add more rows or columns with usable numeric and categorical values to reveal additional patterns.",icon:"info"});
  return findings;
}

export default function InsightsStudio({dataset,onBack}) {
  const [rows,setRows]=useState([]),[busy,setBusy]=useState(true),[error,setError]=useState("");
  const [generatedAt,setGeneratedAt]=useState(null),[exporting,setExporting]=useState(false),[exportMessage,setExportMessage]=useState("");
  useEffect(()=>{let alive=true;setBusy(true);getAllDatasetRows(dataset.id).then(data=>{if(!alive)return;setRows(data);setGeneratedAt(new Date());}).catch(e=>setError(e.message||"Could not load this dataset.")).finally(()=>{if(alive)setBusy(false);});return()=>{alive=false;};},[dataset.id]);
  const headers=dataset.headers||[];
  const result=useMemo(()=>analyse(headers,rows),[headers,rows]);
  const findings=useMemo(()=>buildFindings(result,rows),[result,rows]);
  const quality=result.totalCells?100*(result.totalCells-result.missing)/result.totalCells:0;
  async function exportReport(){
    setExporting(true);
    setExportMessage("");
    try {
      const report={dataset:dataset.fileName,generatedAt:generatedAt?.toISOString(),rows:rows.length,columns:headers.length,quality:{completeness:quality,missingCells:result.missing,exactDuplicateRows:result.duplicateRows},numericSummary:result.numericColumns.map(c=>({column:c.name,count:c.valid.length,mean:c.mean,median:c.median,min:c.min,max:c.max,outliers:c.outliers.length})),correlations:result.pairs,trends:result.trends,findings};
      const blob=new Blob([JSON.stringify(report,null,2)],{type:"application/json"});
      const fileName=`${(dataset.fileName||"dataset").replace(/[^a-z0-9-_]+/gi,"-")}-insights.json`;
      const resultType=await exportFile(blob,fileName,{title:"Insights report",text:`Insights report for ${dataset.fileName}`,dialogTitle:"Save or share insights report"});
      setExportMessage(resultType==="shared"?"Insights JSON created. Choose an app from the Android share sheet to save or share it.":"Insights JSON exported successfully.");
    } catch (e) {
      console.error("Insights export failed:",e);
      setExportMessage(`Insights export failed: ${e?.message||"Unknown error"}`);
    } finally {
      setExporting(false);
    }
  }
  if(busy)return <section className="page-content analytics-page"><div className="analytics-empty glass-card"><RefreshCw size={20}/> Analysing your local dataset…</div></section>;
  if(error)return <section className="page-content analytics-page"><button className="back-link" onClick={onBack}><ArrowLeft size={15}/> Back to dataset</button><div className="analytics-empty glass-card">{error}</div></section>;
  return <section className="page-content analytics-page insights-page">
    <button className="back-link" onClick={onBack}><ArrowLeft size={15}/> Back to dataset</button>
    <div className="page-heading"><div><div className="eyebrow"><i/> PHASE 8 · INSIGHTS STUDIO</div><h1 className="page-title">Insights Studio<span>.</span></h1><p>Understand patterns and data-quality signals in {dataset.fileName}. All findings are calculated locally.</p></div><button className="primary-button" onClick={exportReport} disabled={exporting}><Download size={15}/> {exporting?"Exporting…":"Export insights"}</button></div>
    {exportMessage && <div className="analytics-footnote" role="status">{exportMessage}</div>}
    <div className="insights-disclaimer"><ShieldCheck size={15}/><span>Explainable statistical findings · No paid AI API · No cloud upload. Associations and outlier flags are not causal claims or automatic proof of data errors.</span></div>
    <div className="insights-kpi-grid">
      <article className="glass-card"><small>ROWS ANALYSED</small><b>{fmt(rows.length)}</b><span>Imported records</span></article>
      <article className="glass-card"><small>DATA COMPLETENESS</small><b>{fmt(quality)}%</b><span>{fmt(result.missing)} missing cells</span></article>
      <article className="glass-card"><small>EXACT DUPLICATES</small><b>{fmt(result.duplicateRows)}</b><span>Full-row comparison</span></article>
      <article className="glass-card"><small>NUMERIC FIELDS</small><b>{fmt(result.numericColumns.length)}</b><span>Usable numeric columns</span></article>
    </div>
    <div className="insights-section-head"><div><h2><Sparkles size={18}/> Findings & observations</h2><p>Generated from the current working dataset using transparent statistical rules.</p></div><span className="viz-count">{findings.length} findings</span></div>
    <div className="insights-findings-grid">{findings.map((f,i)=><article className={`glass-card insight-card insight-${f.kind}`} key={`${f.title}-${i}`}><div className="insight-icon">{f.kind==="warning"?<AlertTriangle size={17}/>:f.kind==="good"?<ShieldCheck size={17}/>:f.kind==="action"?<Activity size={17}/>:<Info size={17}/>}</div><div><small>{f.kind.toUpperCase()}</small><h3>{f.title}</h3><p>{f.body}</p></div></article>)}</div>
    <div className="insights-detail-grid">
      <section className="glass-card"><div className="analytics-panel-head"><div><h2><Activity size={17}/> Numeric profile</h2><p>Summary statistics and outlier flags using the 1.5×IQR rule.</p></div></div>{result.numericColumns.length?<div className="insights-table-wrap"><table className="analytics-table"><thead><tr><th>Column</th><th>Valid</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th><th>Outliers</th></tr></thead><tbody>{result.numericColumns.map(c=><tr key={c.index}><td><b>{c.name}</b></td><td>{c.valid.length}</td><td>{fmt(c.mean)}</td><td>{fmt(c.median)}</td><td>{fmt(c.min)}</td><td>{fmt(c.max)}</td><td>{c.outliers.length}</td></tr>)}</tbody></table></div>:<p className="analytics-footnote">No columns have enough valid numeric values for this profile.</p>}</section>
      <section className="glass-card"><div className="analytics-panel-head"><div><h2><TrendingUp size={17}/> Category highlights</h2><p>Most frequent values in categorical fields.</p></div></div><div className="insights-category-list">{result.columns.filter(c=>c.top.length).sort((a,b)=>b.distinct-a.distinct).slice(0,8).map(c=><div key={c.index}><b>{c.name}</b><span>{c.top.slice(0,3).map(([v,n])=>`${v} (${n})`).join(" · ")}</span></div>)}</div></section>
    </div>
    <section className="glass-card insights-correlations"><div className="analytics-panel-head"><div><h2><TrendingUp size={17}/> Time-based trends</h2><p>Monthly averages where a date column and numeric measure can be paired.</p></div></div>{result.trends.length?<div className="insights-category-list">{result.trends.slice(0,8).map(t=><div key={`${t.dateColumn}-${t.valueColumn}`}><b>{t.valueColumn} · {t.dateColumn}</b><span>{t.points[0].period}: {fmt(t.points[0].average)} → {t.points.at(-1).period}: {fmt(t.points.at(-1).average)} · {t.change===null?"—":`${t.change>0?"+":""}${fmt(t.change)}%`}</span></div>)}</div>:<p className="analytics-footnote">No reliable monthly trend could be calculated. This requires a recognisable date column and at least three months of numeric observations.</p>}</section>
    <section className="glass-card insights-correlations"><div className="analytics-panel-head"><div><h2><Activity size={17}/> Strongest numeric relationships</h2><p>Pearson correlation from complete pairs; correlation is not causation.</p></div></div>{result.pairs.length?<div className="insights-correlation-list">{result.pairs.slice(0,8).map(p=><div key={`${p.a}-${p.b}`}><span><b>{p.a}</b> and <b>{p.b}</b></span><div className="insight-correlation-track"><i style={{width:`${Math.abs(p.value)*100}%`}}/></div><strong>{p.value.toFixed(3)}</strong></div>)}</div>:<p className="analytics-footnote">At least two numeric columns with three paired, varying values are needed.</p>}</section>
    <p className="analytics-footnote">Generated {generatedAt?.toLocaleString()||"just now"} · Analyses the current working copy. The original imported CSV is unchanged. Findings are descriptive and do not predict future outcomes.</p>
  </section>;
}
