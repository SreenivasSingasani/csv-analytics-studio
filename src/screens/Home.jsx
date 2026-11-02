import { useRef } from "react";
import { ArrowUpRight, BarChart3, FileSpreadsheet, FolderOpen, ShieldCheck, Sparkles, UploadCloud, Plus, Clock3 } from "lucide-react";
import GlassCard from "../components/GlassCard.jsx";

export default function Home({ onCreateProject, onImport, onViewProjects, projects = [] }) {
  const fileRef = useRef(null);
  const choose = () => fileRef.current?.click();
  return <section className="page-content home-page">
    <div className="home-hero">
      <div className="hero-copy">
        <div className="eyebrow"><i/> LOCAL-FIRST ANALYTICS WORKSPACE</div>
        <h1>Turn raw data into<br/><span>clear decisions.</span></h1>
        <p>Explore, clean, visualize and understand your CSV data — privately on your device.</p>
        <div className="hero-actions">
          <button className="primary-button large" onClick={onCreateProject}><Sparkles size={17}/> Create new project <ArrowUpRight size={16}/></button>
          <button className="secondary-button large" onClick={choose}><UploadCloud size={17}/> Import a CSV</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }}/>
        </div>
        <div className="privacy-note"><ShieldCheck size={15}/> Your datasets stay on your device. No cloud upload.</div>
      </div>
      <div className="hero-art"><div className="orb orb-one"/><div className="orb orb-two"/>
        <div className="preview-window"><div className="preview-head"><span/><span/><span/><i>dataset_overview.csv</i></div>
          <div className="preview-metrics"><div><small>ROWS</small><b>12,480</b></div><div><small>COLUMNS</small><b>08</b></div><div><small>QUALITY</small><b className="good">96.8%</b></div></div>
          <div className="mini-chart">{[38,54,46,72,61,85,67,94,76,100,83,91].map((h,i)=><span key={i} style={{height:`${h}%`}}/>)}</div>
          <div className="preview-foot"><i/><small>Local analysis preview</small><b>●</b></div>
        </div>
        <div className="floating-chip chip-a"><FileSpreadsheet size={15}/> CSV workspace</div><div className="floating-chip chip-b"><Sparkles size={15}/> Smart insights</div>
      </div>
    </div>
    <div className="section-heading"><div><h2>Your workspace</h2><p>A clear starting point for your next analysis.</p></div><button className="text-button" onClick={onViewProjects}>View projects <ArrowUpRight size={15}/></button></div>
    {projects.length ? <div className="home-project-strip">{projects.slice(0,3).map(p => <div className="recent-project glass-card" key={p.id}><div className="project-file-icon"><FileSpreadsheet size={18}/></div><div><b>{p.name}</b><small><Clock3 size={12}/> {new Date(p.createdAt).toLocaleDateString()}</small></div></div>)}</div> : <button className="empty-home-projects glass-card" onClick={onCreateProject}><span className="empty-mini-icon"><Plus size={18}/></span><span><b>No projects yet</b><small>Create your first project to get started.</small></span><ArrowUpRight size={16}/></button>}
    <div className="feature-grid">
      <GlassCard><div className="feature-icon violet"><FileSpreadsheet size={19}/></div><h3>Explore your data</h3><p>Search, sort, filter and inspect rows with a focused data workspace.</p></GlassCard>
      <GlassCard><div className="feature-icon mint"><Sparkles size={19}/></div><h3>Clean with confidence</h3><p>Preview changes before applying them, with a history you can undo.</p></GlassCard>
      <GlassCard><div className="feature-icon amber"><BarChart3 size={19}/></div><h3>Find the story</h3><p>Build charts and discover useful patterns with local analysis.</p></GlassCard>
    </div>
    <footer className="home-footer"><span>CSV Analytics Studio <b>·</b> Ideas into applications.</span><span><ShieldCheck size={13}/> Private by design</span></footer>
  </section>;
}
