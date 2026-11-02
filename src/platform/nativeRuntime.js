import { Capacitor } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard, KeyboardResize } from "@capacitor/keyboard";

export const isNativeApp = () => Capacitor.isNativePlatform();
export const isAndroidApp = () => Capacitor.getPlatform() === "android";

export async function configureNativeRuntime() {
  if (!isNativeApp()) return false;

  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setBackgroundColor({ color: "#080808" });
    await StatusBar.setStyle({ style: Style.Light });
  } catch (error) {
    console.warn("Native status bar configuration was not applied:", error);
  }

  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Body });
  } catch (error) {
    console.warn("Native keyboard resize configuration was not applied:", error);
  }

  return true;
}
