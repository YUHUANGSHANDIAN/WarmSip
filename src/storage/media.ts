import { db } from "./db";
import type { MediaAsset } from "../domain";
export async function sha256(data: Uint8Array | ArrayBuffer) {
  const bytes = data instanceof Uint8Array ? new Uint8Array(data).buffer : data;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function addPhoto(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("请选择 JPG、PNG 或 WebP 图片");
  if (file.size > 15 * 1024 * 1024) throw new Error("每张图片最大 15 MB");
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * ratio);
  canvas.height = Math.round(bitmap.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("图片处理不可用");
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("图片处理失败"))),
      "image/webp",
      0.85,
    ),
  );
  const id = await sha256(await blob.arrayBuffer());
  const asset: MediaAsset = {
    id,
    blob,
    mime: blob.type,
    size: blob.size,
    width: canvas.width,
    height: canvas.height,
    createdAt: Date.now(),
  };
  await db.media.put(asset);
  return id;
}
