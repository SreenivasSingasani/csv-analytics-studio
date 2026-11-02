
import { useRef, useState } from "react";
import {
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
  Database,
  CheckCircle2,
  FileArchive
} from "lucide-react";
import { db } from "../db/database.js";
import { exportFile } from "../platform/exportFile.js";

const FORMAT = "cvas-workspace-backup";
const VERSION = 1;
const TABLES = [
  "projects",
  "datasets",
  "datasetChunks",
  "editHistory",
  "cleaningHistory",
  "savedCharts"
];

function bytesToBase64(bytes) {
  let binary = "";
  const step = 0x8000;

  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }

  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function encodeValue(value) {
  if (value instanceof Blob) {
    return {
      __cvasType: "Blob",
      mime: value.type || "application/octet-stream",
      base64: bytesToBase64(
        new Uint8Array(await value.arrayBuffer())
      )
    };
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map(encodeValue));
  }

  if (value && typeof value === "object") {
    const output = {};

    for (const [key, child] of Object.entries(value)) {
      output[key] = await encodeValue(child);
    }

    return output;
  }

  return value;
}

function decodeValue(value) {
  if (Array.isArray(value)) {
    return value.map(decodeValue);
  }

  if (value && typeof value === "object") {
    if (value.__cvasType === "Blob") {
      if (
        typeof value.base64 !== "string" ||
        typeof value.mime !== "string"
      ) {
        throw new Error(
          "A stored file in this backup is malformed."
        );
      }

      return new Blob(
        [base64ToBytes(value.base64)],
        { type: value.mime }
      );
    }

    const output = {};

    for (const [key, child] of Object.entries(value)) {
      output[key] = decodeValue(child);
    }

    return output;
  }

  return value;
}

async function sha256(text) {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "Secure SHA-256 checks are unavailable in this browser. Open the app in a secure context (HTTPS or localhost) and try again."
    );
  }

  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );

  return [...new Uint8Array(digest)]
    .map(x => x.toString(16).padStart(2, "0"))
    .join("");
}

function canonical(value) {
  if (value === undefined) return "null";

  if (Array.isArray(value)) {
    return `[${value.map(item => canonical(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter(k => value[k] !== undefined)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function validatePayload(payload) {
  if (
    !payload ||
    payload.format !== FORMAT ||
    payload.version !== VERSION ||
    !payload.tables ||
    typeof payload.tables !== "object"
  ) {
    throw new Error(
      "This is not a supported CSV Analytics Studio backup."
    );
  }

  for (const name of TABLES) {
    if (!Array.isArray(payload.tables[name])) {
      throw new Error(`Backup is missing the ${name} table.`);
    }
  }

  const projects = new Set(
    payload.tables.projects.map(x => x?.id).filter(Boolean)
  );

  const datasets = new Set(
    payload.tables.datasets.map(x => x?.id).filter(Boolean)
  );

  if (projects.size !== payload.tables.projects.length) {
    throw new Error(
      "The backup contains invalid or duplicate project IDs."
    );
  }

  if (datasets.size !== payload.tables.datasets.length) {
    throw new Error(
      "The backup contains invalid or duplicate dataset IDs."
    );
  }

  for (const dataset of payload.tables.datasets) {
    if (!projects.has(dataset.projectId)) {
      throw new Error(
        "A dataset refers to a project that is missing from this backup."
      );
    }

    if (!(dataset.originalFile instanceof Blob)) {
      throw new Error(
        "A dataset's original CSV file is missing or invalid."
      );
    }
  }

  for (const name of [
    "datasetChunks",
    "editHistory",
    "cleaningHistory",
    "savedCharts"
  ]) {
    for (const item of payload.tables[name]) {
      if (!datasets.has(item.datasetId)) {
        throw new Error(
          `The ${name} table contains an item with no matching dataset.`
        );
      }
    }
  }

  return true;
}

export default function BackupRestorePanel() {
  const inputRef = useRef(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [preview, setPreview] = useState(null);

  async function exportBackup() {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const tables = {};

      for (const name of TABLES) {
        const records = await db.table(name).toArray();
        tables[name] = await encodeValue(records);
      }

      // Exclude orphaned dataset-scoped records from the backup.
      // The live database remains unchanged.
      const validDatasetIds = new Set(
        tables.datasets.map(item => item?.id)
      );

      const skippedOrphans = {};

      for (const name of [
        "datasetChunks",
        "editHistory",
        "cleaningHistory",
        "savedCharts"
      ]) {
        const before = tables[name].length;

        tables[name] = tables[name].filter(
          item => validDatasetIds.has(item?.datasetId)
        );

        skippedOrphans[name] = before - tables[name].length;
      }

      const skippedTotal = Object.values(skippedOrphans)
        .reduce((sum, count) => sum + count, 0);

      const payload = {
        format: FORMAT,
        version: VERSION,
        app: "CSV Analytics Studio",
        createdAt: new Date().toISOString(),
        tables,
        cleanup: {
          orphanedDatasetRecordsSkipped: skippedTotal,
          byTable: skippedOrphans
        }
      };

      const checksum = await sha256(canonical(payload));

      const file = new Blob(
        [JSON.stringify({ ...payload, checksum }, null, 2)],
        { type: "application/vnd.cvas.backup+json" }
      );

      const fileName =
        `CSV-Analytics-Studio-${new Date().toISOString().slice(0, 10)}.cvas`;

      const exportType = await exportFile(file, fileName, {
        title: "CSV Analytics Studio backup",
        text: "Full workspace backup",
        dialogTitle: "Save workspace backup",
        saveAs: true
      });

      const projectCount = tables.projects.length;
      const datasetCount = tables.datasets.length;

      const destinationMessage =
        exportType === "saved"
          ? " Backup saved successfully to your selected location."
          : exportType === "shared"
            ? " Choose an app from the Android share sheet to save the backup."
            : " Backup downloaded to your browser.";

      setMessage(
        (skippedTotal
          ? `Backup created: ${projectCount} project(s), ${datasetCount} dataset(s). ${skippedTotal} orphaned history/data record(s) were safely excluded; your live workspace was not changed.`
          : `Backup created: ${projectCount} project(s), ${datasetCount} dataset(s), with original CSV files and analysis history.`
        ) + destinationMessage
      );
    } catch (e) {
      setError(e?.message || "Backup could not be created.");
    } finally {
      setBusy(false);
    }
  }

  async function inspectBackup(file) {
    setError("");
    setMessage("");
    setPreview(null);
    setPendingFile(null);

    if (!file) return;

    setBusy(true);

    try {
      if (!file.name.toLowerCase().endsWith(".cvas")) {
        throw new Error("Choose a .cvas backup file.");
      }

      const parsed = JSON.parse(await file.text());
      const { checksum, ...payload } = parsed;

      if (
        typeof checksum !== "string" ||
        checksum !== await sha256(canonical(payload))
      ) {
        throw new Error(
          "Backup integrity check failed. The file may be damaged or modified."
        );
      }

      const decoded = {};

      for (const name of TABLES) {
        decoded[name] = decodeValue(payload.tables?.[name]);
      }

      const ready = { ...payload, tables: decoded };
      validatePayload(ready);

      setPendingFile(file);

      setPreview({
        createdAt: payload.createdAt,
        projects: decoded.projects.length,
        datasets: decoded.datasets.length,
        rows: decoded.datasets.reduce(
          (sum, item) => sum + (Number(item.rowCount) || 0),
          0
        ),
        bytes: file.size
      });

      setMessage(
        "Backup verified. Review the contents before restoring."
      );
    } catch (e) {
      setError(e?.message || "Could not read this backup.");
      setPendingFile(null);
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup() {
    if (!pendingFile || !preview) return;

    const confirmed = window.confirm(
      "Restore this backup? This replaces ALL current CSV Analytics Studio projects and datasets on this device. Export a backup of the current workspace first if you may need it."
    );

    if (!confirmed) return;

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const parsed = JSON.parse(await pendingFile.text());
      const { checksum, ...payload } = parsed;

      if (checksum !== await sha256(canonical(payload))) {
        throw new Error(
          "Backup integrity check failed during restore."
        );
      }

      const decoded = {};

      for (const name of TABLES) {
        decoded[name] = decodeValue(payload.tables[name]);
      }

      validatePayload({ ...payload, tables: decoded });

      await db.transaction(
        "rw",
        ...TABLES.map(name => db.table(name)),
        async () => {
          for (const name of TABLES) {
            await db.table(name).clear();
          }

          for (const name of TABLES) {
            if (decoded[name].length) {
              await db.table(name).bulkPut(decoded[name]);
            }
          }
        }
      );

      localStorage.setItem(
        "cvas-theme",
        localStorage.getItem("cvas-theme") || "dark"
      );

      setMessage("Restore completed. Reloading your workspace…");

      window.setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      setError(
        e?.message ||
        "Restore failed. Your existing workspace was not intentionally cleared."
      );
    } finally {
      setBusy(false);
    }
  }

  const fmtBytes = n =>
    n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / (1024 * 1024)).toFixed(2)} MB`;

  return (
    <section className="settings-panel glass-card backup-panel">
      <div className="settings-panel-heading">
        <div className="settings-icon">
          <FileArchive size={18} />
        </div>
        <div>
          <h3>Workspace backup & restore</h3>
          <p>Make a portable copy of your local projects and analysis.</p>
        </div>
      </div>

      <div className="backup-explainer">
        <ShieldCheck size={16} />
        <span>
          Everything stays on this device until you choose where to save the backup. No cloud upload is used.
        </span>
      </div>

      <div className="backup-includes">
        <b>Included in the backup</b>
        <span>Projects and descriptions</span>
        <span>Original CSV files and parsed working data</span>
        <span>Cell edits, cleaning history and saved charts</span>
      </div>

      <div className="backup-actions">
        <button
          className="primary-button"
          onClick={exportBackup}
          disabled={busy}
        >
          <Download size={15} />
          {busy ? "Working…" : "Export full workspace"}
        </button>

        <button
          className="secondary-button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload size={15} />
          Choose .cvas backup
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="*/*"
          hidden
          onChange={e => inspectBackup(e.target.files?.[0])}
        />
      </div>

      {preview && (
        <div className="backup-preview">
          <div className="backup-preview-title">
            <CheckCircle2 size={16} />
            Verified backup
          </div>

          <div className="backup-preview-stats">
            <span><b>{preview.projects}</b> projects</span>
            <span><b>{preview.datasets}</b> datasets</span>
            <span><b>{preview.rows.toLocaleString()}</b> rows</span>
            <span><b>{fmtBytes(preview.bytes)}</b> file size</span>
          </div>

          <small>
            Created {new Date(preview.createdAt).toLocaleString()}
          </small>

          <button
            className="primary-button restore-button"
            onClick={restoreBackup}
            disabled={busy}
          >
            <Database size={15} />
            Restore and replace current workspace
          </button>
        </div>
      )}

      {message && (
        <p className="backup-message">
          <CheckCircle2 size={14} />
          {message}
        </p>
      )}

      {error && (
        <p className="backup-error">
          <AlertTriangle size={14} />
          {error}
        </p>
      )}

      <p className="storage-disclaimer">
        Keep .cvas backups somewhere safe. Browser data clearing can still remove the live workspace. Restoring replaces all current projects on this device; it does not merge backups.
      </p>
    </section>
  );
}
