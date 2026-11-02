import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, ChevronDown, CircleHelp, FileSpreadsheet, Folder, FolderOpen,
  LayoutDashboard, Menu, Plus, Search, Settings, ShieldCheck, SlidersHorizontal,
  Sparkles, Sun, Trash2, X, Clock3, MoreHorizontal, Copy, Pencil, ArrowLeft,
  Database, HardDrive, RefreshCw, Download, WifiOff
} from "lucide-react";
import Home from "./screens/Home.jsx";
import ThemeSwitcher from "./components/ThemeSwitcher.jsx";
import CsvWorkspace from "./components/CsvWorkspace.jsx";
import BackupRestorePanel from "./components/BackupRestorePanel.jsx";
import { db, getAllProjects, getProject, removeProject, saveProject } from "./db/database.js";


function createLocalId() {
  // crypto.randomUUID() is unavailable on some non-HTTPS LAN origins on mobile.
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, "0"));
    return `${hex.slice(0,4).join("")}-${hex.slice(4,6).join("")}-${hex.slice(6,8).join("")}-${hex.slice(8,10).join("")}-${hex.slice(10,16).join("")}`;
  }
  return `cvas-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

const navItems = [
  { id: "home", label: "Home", icon: LayoutDashboard },
  { id: "projects", label: "My Projects", icon: FolderOpen },
  { id: "settings", label: "Settings", icon: Settings },
];

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("cvas-theme") || "dark");
  const [page, setPage] = useState("home");
  const [mobileNav, setMobileNav] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [storageEstimate, setStorageEstimate] = useState(null);
  const [storageError, setStorageError] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true
  );

  useEffect(() => {
    const onInstallPrompt = event => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      setToast("CSV Analytics Studio installed successfully.");
    };
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  async function refreshProjects() {
    const rows = await getAllProjects();
    setProjects(rows);
    return rows;
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("cvas-theme", theme);
  }, [theme]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refreshProjects();
      } catch (error) {
        console.error("Unable to load local projects", error);
        if (alive) setStorageError("Local project storage could not be opened in this browser.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    let alive = true;
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then(result => {
        if (alive) setStorageEstimate(result);
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [projects.length]);

  const filteredProjects = useMemo(() => {
    const filtered = projects.filter(p => `${p.name} ${p.description || ""}`.toLowerCase().includes(query.toLowerCase()));
    return [...filtered].sort((a, b) => sort === "name"
      ? a.name.localeCompare(b.name)
      : new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  }, [projects, query, sort]);

  function openCreateDialog() {
    setDialogMode("create"); setEditingId(null); setName(""); setDescription(""); setDialog(true);
  }

  function openRenameDialog(project) {
    setDialogMode("rename"); setEditingId(project.id); setName(project.name); setDescription(project.description || ""); setDialog(true);
  }

  async function submitProjectDialog() {
    const projectName = name.trim();
    if (!projectName) return;
    try {
      const now = new Date().toISOString();
      if (dialogMode === "rename") {
        const existing = await getProject(editingId);
        if (!existing) throw new Error("Project no longer exists.");
        await saveProject({ ...existing, name: projectName, description: description.trim(), updatedAt: now });
        setToast("Project renamed and saved");
      } else {
        const project = {
          id: createLocalId(),
          name: projectName,
          description: description.trim(),
          createdAt: now,
          updatedAt: now,
          fileName: "",
          schemaVersion: 1
        };
        await saveProject(project);
        setToast("Project saved on this device");
        if (pendingFile) {
          setActiveProject(project);
          setPage("workspace");
        } else {
          setPage("projects");
        }
      }
      await refreshProjects();
      setDialog(false); setName(""); setDescription(""); setEditingId(null);
      if (dialogMode === "rename") setPage("workspace");
    } catch (error) {
      console.error("Project save failed", error);
      setToast("Could not save project. Check browser storage.");
    }
  }

  function importFile(file) {
    setPendingFile(file);
    setName(file.name.replace(/\.csv$/i, "") || "Untitled dataset");
    setDescription(`Imported from ${file.name}`);
    setDialogMode("create"); setEditingId(null); setDialog(true);
  }

  async function deleteProject(project) {
    if (!window.confirm(`Delete "${project.name}" from this device? This cannot be undone.`)) return;
    try {
      await removeProject(project.id);
      await refreshProjects();
      if (activeProject?.id === project.id) { setActiveProject(null); setPage("projects"); }
      setToast("Project deleted from this device");
    } catch (error) {
      console.error("Project deletion failed", error);
      setToast("Could not delete project.");
    }
  }

  async function duplicateProject(project) {
    try {
      const now = new Date().toISOString();
      const copy = {
        ...project,
        id: createLocalId(),
        name: `${project.name} (Copy)`,
        createdAt: now,
        updatedAt: now
      };
      await saveProject(copy);
      await refreshProjects();
      setToast("Project duplicated");
    } catch (error) {
      console.error("Project duplication failed", error);
      setToast("Could not duplicate project.");
    }
  }

  async function openProject(project) {
    try {
      const latest = await getProject(project.id);
      if (!latest) { await refreshProjects(); setToast("Project could not be found."); return; }
      setActiveProject(latest);
      const now = new Date().toISOString();
      await saveProject({ ...latest, updatedAt: now });
      await refreshProjects();
      setPage("workspace");
    } catch (error) {
      console.error("Project open failed", error);
      setToast("Could not open project.");
    }
  }

  function navigate(next) { setPage(next); setMobileNav(false); setDesktopSidebarOpen(false); }

  const formatBytes = bytes => {
    if (bytes == null) return "Unavailable";
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return <>
    <div className={`app-frame ${desktopSidebarOpen ? "desktop-sidebar-open" : "desktop-sidebar-collapsed"}`}>
      <aside className={`sidebar ${mobileNav || desktopSidebarOpen ? "sidebar--open" : ""}`}>
        <div className="sidebar-brand">
          <span className="brand-mark"><BarChart3 size={19}/></span>
          <span><strong>CSV Analytics Studio</strong><small>Built By Sreenu_Zero6</small></span>
          <button className="icon-button sidebar-close" onClick={() => { setMobileNav(false); setDesktopSidebarOpen(false); }} aria-label="Close navigation"><X size={17}/></button>
        </div>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav">
          {navItems.map(item => {
            const Icon = item.icon;
            return <button key={item.id} className={`side-link ${page === item.id || (item.id === "projects" && page === "workspace") ? "active" : ""}`} onClick={() => navigate(item.id)}>
              <Icon size={17}/><span>{item.label}</span>{item.id === "projects" && <small>{projects.length}</small>}
            </button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-privacy"><ShieldCheck size={16}/><span><b>Private by design</b><small>Your data stays on this device.</small></span></div>
          <div className="sidebar-user"><div className="avatar">SZ</div><span><b>Sreenu_Zero6</b><small>Personal workspace</small></span><MoreHorizontal size={17}/></div>
        </div>
      </aside>
      {mobileNav && <button className="sidebar-scrim" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
      {desktopSidebarOpen && <button className="desktop-sidebar-dismiss" onClick={() => setDesktopSidebarOpen(false)} aria-label="Close navigation"/>}
      <main className="main-area">
        <header className="app-topbar">
          <div className="topbar-left">
            <button className="icon-button nav-toggle" onClick={() => { if (window.matchMedia("(max-width: 850px)").matches) setMobileNav(true); else setDesktopSidebarOpen(open => !open); }} aria-label={desktopSidebarOpen ? "Collapse sidebar" : "Expand sidebar"} title={desktopSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}><Menu size={18}/></button>
            <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><b>{page === "home" ? "Home" : page === "projects" ? "My Projects" : page === "settings" ? "Settings" : activeProject?.name || "Project"}</b></div>
          </div>
          <div className="topbar-right">
            <span className={`local-status ${isOffline ? "offline-status" : ""}`}>{isOffline ? <><WifiOff size={13}/> Offline</> : <><i/> Local mode</>}</span>
            {installPrompt && !isInstalled && <button className="secondary-button pwa-install-button" onClick={installApp}><Download size={14}/> Install app</button>}
            <ThemeSwitcher theme={theme} onToggle={() => setTheme(t => t === "dark" ? "light" : "dark")}/>
            <button className="primary-button top-create" onClick={openCreateDialog}><Plus size={16}/> New project</button>
          </div>
        </header>

        {page === "home" && <Home onCreateProject={openCreateDialog} onImport={importFile} onViewProjects={() => navigate("projects")} projects={projects}/>}
        {page === "projects" && <section className="page-content">
          <div className="page-heading"><div><div className="eyebrow"><i/> YOUR WORKSPACE</div><h1 className="page-title">My Projects<span>.</span></h1><p>Pick up where you left off, or create a fresh space for your data.</p></div>
            <button className="primary-button" onClick={openCreateDialog}><Plus size={16}/> Create project</button></div>
          <div className="project-toolbar">
            <div className="search-box"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects..."/></div>
            <label className="sort-control"><SlidersHorizontal size={15}/><span>Sort by</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="recent">Recently updated</option><option value="name">Name A–Z</option></select><ChevronDown size={14}/></label>
          </div>
          {loading ? <div className="empty-projects glass-card"><RefreshCw size={22}/><h2>Loading your projects</h2><p>Opening your local workspace…</p></div> :
          filteredProjects.length ? <div className="project-grid">{filteredProjects.map(project => <article className="project-card glass-card" key={project.id}>
            <div className="project-card-top"><div className="project-file-icon"><FileSpreadsheet size={20}/></div><div className="project-actions">
              <button className="icon-button project-action" onClick={() => openRenameDialog(project)} title="Rename project" aria-label={`Rename ${project.name}`}><Pencil size={14}/></button>
              <button className="icon-button project-action" onClick={() => duplicateProject(project)} title="Duplicate project" aria-label={`Duplicate ${project.name}`}><Copy size={14}/></button>
              <button className="icon-button project-action project-delete" onClick={() => deleteProject(project)} title="Delete project" aria-label={`Delete ${project.name}`}><Trash2 size={14}/></button>
            </div></div>
            <button className="project-open-area" onClick={() => openProject(project)}><h3>{project.name}</h3><p>{project.description || "No description added yet."}</p></button>
            <div className="project-card-foot"><span><Clock3 size={13}/>{new Date(project.updatedAt || project.createdAt).toLocaleDateString()}</span><span className="project-status">Saved locally</span></div>
          </article>)}</div> : <div className="empty-projects glass-card"><div className="empty-icon"><Folder size={25}/></div><h2>{query ? "No matching projects" : "Your workspace is ready"}</h2><p>{query ? "Try another search term or clear the search." : "Create your first project to keep your datasets and analysis organised on this device."}</p>{!query && <button className="primary-button" onClick={openCreateDialog}><Plus size={16}/> Create your first project</button>}</div>}
          {storageError && <p className="session-note error-note">{storageError}</p>}
          <p className="session-note"><ShieldCheck size={14}/> Project details are saved in this browser's local IndexedDB. Browser data clearing or storage eviction can remove them; export/backup is planned for a later phase.</p>
        </section>}
        {page === "workspace" && activeProject && <CsvWorkspace project={activeProject} initialFile={pendingFile} onFileImported={() => setPendingFile(null)} onBack={() => navigate("projects")} onRename={() => openRenameDialog(activeProject)}/>}
        {page === "settings" && <section className="page-content settings-page">
          <div className="page-heading"><div><div className="eyebrow"><i/> PREFERENCES</div><h1 className="page-title">Settings<span>.</span></h1><p>Make your workspace feel right for the way you work.</p></div></div>
          <div className="settings-layout">
            <section className="settings-panel glass-card"><div className="settings-panel-heading"><div className="settings-icon"><Sun size={18}/></div><div><h3>Appearance</h3><p>Choose the look of your analytics workspace.</p></div></div>
              <div className="theme-options">
                <button className={`theme-option ${theme === "light" ? "selected" : ""}`} onClick={() => setTheme("light")}><span className="theme-swatch theme-swatch-light"><i/><i/><i/></span><span><b>Light</b><small>Soft, bright surfaces</small></span>{theme === "light" && <span className="selected-dot"/>}</button>
                <button className={`theme-option ${theme === "dark" ? "selected" : ""}`} onClick={() => setTheme("dark")}><span className="theme-swatch theme-swatch-dark"><i/><i/><i/></span><span><b>Dark</b><small>Graphite and violet</small></span>{theme === "dark" && <span className="selected-dot"/>}</button>
              </div>
            </section>
            <section className="settings-panel glass-card"><div className="settings-panel-heading"><div className="settings-icon"><ShieldCheck size={18}/></div><div><h3>Privacy & data</h3><p>How CSV Analytics Studio handles your data.</p></div></div>
              <div className="setting-row"><div><b>Local-first processing</b><small>Project metadata is stored locally in your browser.</small></div><span className="setting-pill"><i/> Enabled</span></div>
              <div className="setting-row"><div><b>Cloud uploads</b><small>No dataset upload service is connected.</small></div><span className="setting-pill neutral">Not used</span></div>
              <div className="setting-row"><div><b>Persistent storage</b><small>Browser storage can still be cleared or evicted. Use Workspace backup & restore to keep a portable copy.</small></div><span className="setting-pill">IndexedDB</span></div>
            </section>
            <BackupRestorePanel />
            <section className="settings-panel glass-card"><div className="settings-panel-heading"><div className="settings-icon"><HardDrive size={18}/></div><div><h3>Browser storage</h3><p>Approximate browser storage usage for this site.</p></div></div>
              <div className="storage-stats"><div><small>USED</small><b>{formatBytes(storageEstimate?.usage)}</b></div><div><small>QUOTA</small><b>{formatBytes(storageEstimate?.quota)}</b></div></div>
              <p className="storage-disclaimer">Browser-reported estimate; it may include other site data and is not a per-project measurement.</p>
            </section>
            <section className="settings-panel glass-card about-panel"><div className="settings-panel-heading"><div className="settings-icon"><CircleHelp size={18}/></div><div><h3>About this app</h3><p>A private workspace for exploring data.</p></div></div>
              <div className="about-line"><span>Application</span><b>CSV Analytics Studio</b></div><div className="about-line"><span>Version</span><b>Phase 2 · Local project storage</b></div><div className="about-line"><span>Built by</span><b>Sreenu_Zero6</b></div><div className="about-tagline">Ideas into applications.</div>
            </section>
          </div>
        </section>}
      </main>
    </div>

    {dialog && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setDialog(false); }}>
      <section className="project-modal" role="dialog" aria-modal="true" aria-labelledby="new-title">
        <button className="modal-close icon-button" onClick={() => setDialog(false)} aria-label="Close"><X size={17}/></button>
        <div className="modal-icon">{dialogMode === "rename" ? <Pencil size={21}/> : <FolderOpen size={21}/>}</div><h2 id="new-title">{dialogMode === "rename" ? "Rename project" : "Create a project"}</h2><p>{dialogMode === "rename" ? "Update the project name or description. Your changes will be saved locally." : "Give your workspace a name. You can add a CSV in a later step or start with an empty project."}</p>
        <label htmlFor="project-name">Project name</label><input id="project-name" className="text-input" autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submitProjectDialog(); }} placeholder="e.g. Sales performance analysis"/>
        <label htmlFor="project-description" className="description-label">Description <span>Optional</span></label><textarea id="project-description" className="text-input description-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="What will you explore?"/>
        <div className="modal-actions"><button className="secondary-button" onClick={() => setDialog(false)}>Cancel</button><button className="primary-button" disabled={!name.trim()} onClick={submitProjectDialog}>{dialogMode === "rename" ? <><Pencil size={15}/> Save changes</> : <><Plus size={16}/> Create project</>}</button></div>
      </section>
    </div>}
    {toast && <div className="toast-message"><Sparkles size={15}/>{toast}</div>}
  </>;
}
export default App;
