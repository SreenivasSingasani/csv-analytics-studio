import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";

// App-private storage adapter. Files saved in Directory.Data are private to
// this app installation and are removed when the app is uninstalled.
export async function writePrivateTextFile(path, data) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("App-private filesystem storage is available only in the native app.");
  }
  return Filesystem.writeFile({
    path,
    data,
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true
  });
}

export async function readPrivateTextFile(path) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("App-private filesystem storage is available only in the native app.");
  }
  const result = await Filesystem.readFile({
    path,
    directory: Directory.Data,
    encoding: Encoding.UTF8
  });
  return typeof result.data === "string" ? result.data : "";
}

export async function deletePrivateFile(path) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error("App-private filesystem storage is available only in the native app.");
  }
  return Filesystem.deleteFile({ path, directory: Directory.Data });
}
