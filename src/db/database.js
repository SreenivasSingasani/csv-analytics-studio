import Dexie from "dexie";

export const db = new Dexie("csvAnalyticsStudio");

db.version(1).stores({
  projects: "id, name, createdAt, updatedAt"
});

db.version(2).stores({
  projects: "id, name, createdAt, updatedAt",
  datasets: "id, projectId, name, fileName, importedAt, status",
  datasetChunks: "++id, [datasetId+chunkIndex], datasetId, chunkIndex"
});

db.version(3).stores({
  projects: "id, name, createdAt, updatedAt",
  datasets: "id, projectId, name, fileName, importedAt, status",
  datasetChunks: "++id, [datasetId+chunkIndex], datasetId, chunkIndex",
  editHistory: "++id, datasetId, rowIndex, createdAt, applied"
});

db.version(4).stores({
  projects: "id, name, createdAt, updatedAt",
  datasets: "id, projectId, name, fileName, importedAt, status",
  datasetChunks: "++id, [datasetId+chunkIndex], datasetId, chunkIndex",
  editHistory: "++id, datasetId, rowIndex, createdAt, applied",
  cleaningHistory: "++id, datasetId, createdAt, applied"
});

db.version(5).stores({
  projects: "id, name, createdAt, updatedAt",
  datasets: "id, projectId, name, fileName, importedAt, status",
  datasetChunks: "++id, [datasetId+chunkIndex], datasetId, chunkIndex",
  editHistory: "++id, datasetId, rowIndex, createdAt, applied",
  cleaningHistory: "++id, datasetId, createdAt, applied",
  savedCharts: "++id, datasetId, createdAt, title, type"
});

export async function getAllProjects() {
  return db.projects.orderBy("updatedAt").reverse().toArray();
}
export async function saveProject(project) {
  await db.projects.put(project);
  return project;
}
export async function removeProject(id) {
  await db.transaction("rw", db.projects, db.datasets, db.datasetChunks, db.editHistory, db.cleaningHistory, db.savedCharts, async () => {
    const datasets = await db.datasets.where("projectId").equals(id).toArray();
    const ids = datasets.map(item => item.id);
    if (ids.length) {
      await db.datasetChunks.where("datasetId").anyOf(ids).delete();
      await db.datasets.bulkDelete(ids);
      await db.savedCharts.where("datasetId").anyOf(ids).delete();
    }
    await db.projects.delete(id);
  });
}
export async function getProject(id) {
  return db.projects.get(id);
}
export async function getProjectDatasets(projectId) {
  return db.datasets.where("projectId").equals(projectId).reverse().sortBy("importedAt");
}
export async function getDatasetPreview(datasetId, limit = 50, offset = 0) {
  const chunks = await db.datasetChunks.where("datasetId").equals(datasetId).sortBy("chunkIndex");
  const rows = [];
  const end = offset + limit;
  let cursor = 0;
  for (const chunk of chunks) {
    const chunkStart = cursor;
    const chunkEnd = cursor + chunk.rows.length;
    if (chunkEnd > offset && chunkStart < end) {
      const from = Math.max(0, offset - chunkStart);
      const to = Math.min(chunk.rows.length, end - chunkStart);
      rows.push(...chunk.rows.slice(from, to));
    }
    cursor = chunkEnd;
    if (cursor >= end) break;
  }
  return rows;
}

export async function getAllDatasetRows(datasetId) {
  const chunks = await db.datasetChunks.where("datasetId").equals(datasetId).sortBy("chunkIndex");
  return chunks.flatMap(chunk => chunk.rows);
}

export async function updateDatasetCell(datasetId, rowIndex, columnIndex, value) {
  return db.transaction("rw", db.datasetChunks, db.editHistory, async () => {
    const chunks = await db.datasetChunks.where("datasetId").equals(datasetId).sortBy("chunkIndex");
    let offset = 0;
    for (const chunk of chunks) {
      if (rowIndex < offset + chunk.rows.length) {
        const localIndex = rowIndex - offset;
        const oldValue = chunk.rows[localIndex][columnIndex] ?? "";
        const rows = chunk.rows.map((row, index) => index === localIndex
          ? row.map((cell, col) => col === columnIndex ? value : cell)
          : row);
        await db.datasetChunks.put({ ...chunk, rows });
        await db.editHistory.add({
          datasetId, rowIndex, columnIndex, oldValue, newValue: value,
          createdAt: new Date().toISOString(), applied: true
        });
        return { oldValue, newValue: value };
      }
      offset += chunk.rows.length;
    }
    throw new Error("The selected row could not be found.");
  });
}

export async function getEditHistory(datasetId) {
  return db.editHistory.where("datasetId").equals(datasetId).sortBy("id");
}

export async function applyEditHistory(historyId, useOldValue) {
  return db.transaction("rw", db.datasetChunks, db.editHistory, async () => {
    const edit = await db.editHistory.get(historyId);
    if (!edit) return;
    const chunks = await db.datasetChunks.where("datasetId").equals(edit.datasetId).sortBy("chunkIndex");
    let offset = 0;
    for (const chunk of chunks) {
      if (edit.rowIndex < offset + chunk.rows.length) {
        const localIndex = edit.rowIndex - offset;
        const rows = chunk.rows.map((row, index) => index === localIndex
          ? row.map((cell, col) => col === edit.columnIndex ? (useOldValue ? edit.oldValue : edit.newValue) : cell)
          : row);
        await db.datasetChunks.put({ ...chunk, rows });
        await db.editHistory.update(historyId, { applied: !useOldValue });
        return;
      }
      offset += chunk.rows.length;
    }
    throw new Error("The edit history row could not be found.");
  });
}
export async function deleteDataset(datasetId) {
  await db.transaction("rw", db.datasets, db.datasetChunks, db.editHistory, db.cleaningHistory, db.savedCharts, async () => {
    await db.datasetChunks.where("datasetId").equals(datasetId).delete();
    await db.editHistory.where("datasetId").equals(datasetId).delete();
    await db.cleaningHistory.where("datasetId").equals(datasetId).delete();
    await db.savedCharts.where("datasetId").equals(datasetId).delete();
    await db.datasets.delete(datasetId);
  });
}
export async function getDataset(datasetId) {
  return db.datasets.get(datasetId);
}


// Apply a bulk cleaning transformation atomically and retain a reversible snapshot.
export async function applyDatasetCleaning(datasetId, transform, description) {
  return db.transaction("rw", db.datasetChunks, db.datasets, db.cleaningHistory, db.editHistory, async () => {
    const beforeEditHistory = await db.editHistory.where("datasetId").equals(datasetId).toArray();
    const beforeChunks = await db.datasetChunks.where("datasetId").equals(datasetId).sortBy("chunkIndex");
    const sourceRows = beforeChunks.flatMap(chunk => chunk.rows);
    const transformed = transform(sourceRows);
    if (!transformed || !Array.isArray(transformed.rows)) throw new Error("The cleaning operation did not return valid rows.");
    const rows = transformed.rows;
    const afterChunks = [];
    for (let i = 0; i < rows.length; i += 500) {
      afterChunks.push({ datasetId, chunkIndex: afterChunks.length, rows: rows.slice(i, i + 500) });
    }
    await db.datasetChunks.where("datasetId").equals(datasetId).delete();
    if (afterChunks.length) await db.datasetChunks.bulkAdd(afterChunks);
    // Cell-edit row indexes may no longer point to the same records after bulk cleaning.
    await db.editHistory.where("datasetId").equals(datasetId).delete();
    const dataset = await db.datasets.get(datasetId);
    await db.datasets.update(datasetId, { rowCount: rows.length, cleanedAt: new Date().toISOString() });
    await db.cleaningHistory.add({
      datasetId, description, createdAt: new Date().toISOString(), applied: true,
      beforeChunks, beforeEditHistory, beforeRowCount: sourceRows.length, afterRowCount: rows.length,
      details: transformed.details || {}
    });
    return { beforeRowCount: sourceRows.length, afterRowCount: rows.length, details: transformed.details || {}, dataset };
  });
}

export async function getCleaningHistory(datasetId) {
  return db.cleaningHistory.where("datasetId").equals(datasetId).sortBy("id");
}

export async function undoDatasetCleaning(datasetId) {
  return db.transaction("rw", db.datasetChunks, db.datasets, db.cleaningHistory, db.editHistory, async () => {
    const history = await db.cleaningHistory.where("datasetId").equals(datasetId).sortBy("id");
    const latest = [...history].reverse().find(item => item.applied);
    if (!latest) return false;
    await db.datasetChunks.where("datasetId").equals(datasetId).delete();
    if (latest.beforeChunks.length) {
      await db.datasetChunks.bulkAdd(latest.beforeChunks.map(({ id, ...chunk }) => chunk));
    }
    await db.datasets.update(datasetId, { rowCount: latest.beforeRowCount });
    await db.editHistory.where("datasetId").equals(datasetId).delete();
    if (latest.beforeEditHistory?.length) await db.editHistory.bulkAdd(latest.beforeEditHistory.map(({ id, ...item }) => item));
    await db.cleaningHistory.update(latest.id, { applied: false });
    return true;
  });
}


export async function getSavedCharts(datasetId) {
  return db.savedCharts.where("datasetId").equals(datasetId).sortBy("createdAt");
}
export async function saveChart(chart) {
  return db.savedCharts.add(chart);
}
export async function deleteSavedChart(id) {
  return db.savedCharts.delete(id);
}
