
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

const CvasDocument = registerPlugin("CvasDocument");

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");

      if (comma < 0) {
        reject(new Error("The file could not be encoded for sharing."));
      } else {
        resolve(result.slice(comma + 1));
      }
    };

    reader.onerror = () =>
      reject(new Error("The file could not be read for sharing."));

    reader.readAsDataURL(blob);
  });
}

function safeFileName(name) {
  return String(name || "export")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120) || "export";
}

/**
 * Exports a Blob using:
 * - Android native Save As for .cvas backups when saveAs is true.
 * - Capacitor Filesystem + Share for other native exports.
 * - Browser download for web/PWA.
 *
 * Returns "saved", "shared", or "downloaded".
 */
export async function exportFile(blob, fileName, options = {}) {
  if (!(blob instanceof Blob)) {
    throw new Error("Nothing valid was generated to export.");
  }

  const name = safeFileName(fileName);

  if (Capacitor.isNativePlatform()) {
    const base64 = await blobToBase64(blob);

    // Native Android Save As for workspace backups.
    if (
      Capacitor.getPlatform() === "android" &&
      options.saveAs === true
    ) {
      const result = await CvasDocument.saveDocument({
        fileName: name,
        dataBase64: base64,
        mimeType: blob.type || "application/octet-stream"
      });

      if (!result?.saved) {
        throw new Error("The backup was not saved successfully.");
      }

      return "saved";
    }

    // Existing native export flow for CSV, PNG, JSON, etc.
    const uniqueName = `${Date.now()}-${name}`;

    const saved = await Filesystem.writeFile({
      path: uniqueName,
      data: base64,
      directory: Directory.Cache,
      recursive: true
    });

    await Share.share({
      title: options.title || name,
      text: options.text || "Exported from CSV Analytics Studio",
      files: [saved.uri],
      dialogTitle: options.dialogTitle || "Save or share file"
    });

    return "shared";
  }

  // Existing web/PWA download flow.
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = name;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1500);

  return "downloaded";
}
