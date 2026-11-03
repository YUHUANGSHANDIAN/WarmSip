import { Capacitor } from "@capacitor/core";
import type { Coordinate } from "../domain";
declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
    warmNative?: { invoke: (method: string, payload: string) => string };
  }
}
export interface PlatformAdapter {
  saveFile: (name: string, blob: Blob) => Promise<void>;
  share: (text: string, file?: File) => Promise<void>;
  locate: () => Promise<Coordinate>;
  openExternal: (url: string) => Promise<void>;
}
const tauri = () => Boolean(window.__TAURI_INTERNALS__);
function safeUrl(url: string) {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol))
    throw new Error("只允许打开网页地址");
  return parsed.href;
}
async function base64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("文件读取失败"));
    r.readAsDataURL(blob);
  });
}
export const platform: PlatformAdapter = {
  async saveFile(name, blob) {
    if (tauri()) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const path = await save({ defaultPath: name });
      if (!path) throw new DOMException("已取消保存", "AbortError");
      await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
      return;
    }
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const result = await Filesystem.writeFile({
        path: name,
        data: await base64(blob),
        directory: Directory.Cache,
      });
      await Share.share({ files: [result.uri], title: "保存 WarmSip 文件" });
      return;
    }
    if (window.warmNative) {
      const result = JSON.parse(
        window.warmNative.invoke(
          "saveFile",
          JSON.stringify({ name, base64: await base64(blob), mime: blob.type }),
        ),
      );
      if (result.error) throw new Error(result.error);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  async share(text, file) {
    if (Capacitor.isNativePlatform() && !file) {
      const { Share } = await import("@capacitor/share");
      await Share.share({ text, title: "WarmSip 暖迹" });
      return;
    }
    const data: ShareData = {
      title: "WarmSip 暖迹",
      text,
      ...(file ? { files: [file] } : {}),
    };
    if (navigator.share && (!file || navigator.canShare?.(data))) {
      await navigator.share(data);
      return;
    }
    if (file) {
      await platform.saveFile(file.name, file);
      return;
    }
    await navigator.clipboard.writeText(text);
  },
  async locate() {
    if (Capacitor.isNativePlatform()) {
      const { Geolocation } = await import("@capacitor/geolocation");
      const p = await Geolocation.getCurrentPosition({
        timeout: 10000,
        enableHighAccuracy: false,
      });
      return {
        latitude: p.coords.latitude,
        longitude: p.coords.longitude,
        crs: "WGS84",
      };
    }
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("此平台暂不支持定位，请手动选择城市"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (p) =>
          resolve({
            latitude: p.coords.latitude,
            longitude: p.coords.longitude,
            crs: "WGS84",
          }),
        () => reject(new Error("定位不可用或权限被拒绝，仍可手动选择城市")),
        { timeout: 10000, maximumAge: 60000, enableHighAccuracy: false },
      );
    });
  },
  async openExternal(url) {
    const safe = safeUrl(url);
    if (tauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(safe);
    } else if (Capacitor.isNativePlatform()) {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: safe });
    } else if (window.warmNative) {
      window.warmNative.invoke("openExternal", JSON.stringify({ url: safe }));
    } else window.open(safe, "_blank", "noopener,noreferrer");
  },
};
export function navigationUrl(name: string, coordinate: Coordinate) {
  return `https://uri.amap.com/marker?position=${coordinate.longitude},${coordinate.latitude}&name=${encodeURIComponent(name)}&src=WarmSip&coordinate=${coordinate.crs === "GCJ02" ? "gaode" : "gps"}&callnative=0`;
}
