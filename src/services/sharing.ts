import type { MapCollection, PlaceRecord } from "../domain";
import { statusLabels } from "../domain";
import { db } from "../storage/db";
export interface ShareOptions {
  notes: boolean;
  coordinates: boolean;
  photos: boolean;
  recipient: boolean;
}
export const privateShareDefaults: ShareOptions = {
  notes: false,
  coordinates: false,
  photos: false,
  recipient: false,
};
export function mapSummary(
  map: MapCollection,
  places: PlaceRecord[],
  options: ShareOptions,
  recipient = "",
) {
  const lines = [
    map.title,
    `${places.length} 个地点 · ${places.filter((p) => p.status === "visited").length} 个到访记录`,
  ];
  if (options.recipient && recipient) lines.push(`与 ${recipient} 有关的暖迹`);
  for (const p of places) {
    lines.push(
      `${statusLabels[p.status]} · ${p.name}${p.city ? `（${p.city}）` : ""}`,
    );
    if (options.notes && p.note) lines.push(p.note);
    if (options.coordinates && p.coordinate)
      lines.push(
        `${p.coordinate.latitude}, ${p.coordinate.longitude} · ${p.coordinate.crs}`,
      );
  }
  lines.push("WarmSip · 收藏每一个值得记住的地方");
  return lines.join("\n");
}
export async function shareCard(
  map: MapCollection,
  places: PlaceRecord[],
  options: ShareOptions,
  recipient = "",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("此设备暂不支持图片卡片生成");
  ctx.fillStyle = "#FFF7F2";
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#FF6B57";
  ctx.beginPath();
  ctx.arc(950, 100, 230, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#6A4B3C";
  ctx.font = "bold 48px sans-serif";
  ctx.fillText("WarmSip", 80, 120);
  ctx.font = "24px sans-serif";
  ctx.fillText("SEND A LITTLE WARMTH", 80, 165);
  ctx.font = "bold 52px sans-serif";
  ctx.fillText(map.title.slice(0, 18), 80, 290);
  ctx.font = "26px sans-serif";
  ctx.fillText(
    `${places.length} 个地点 · ${places.filter((p) => p.status === "visited").length} 份到访回忆`,
    80,
    350,
  );
  if (options.recipient && recipient)
    ctx.fillText(`与 ${recipient} 有关的暖迹`, 80, 405);
  let y = 480;
  for (const p of places.slice(0, 4)) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(64, y - 40, 952, 160);
    ctx.fillStyle = "#6A4B3C";
    ctx.font = "bold 29px sans-serif";
    ctx.fillText(`${statusLabels[p.status]} · ${p.name}`.slice(0, 25), 90, y);
    ctx.font = "23px sans-serif";
    ctx.fillText((options.notes ? p.note : p.city).slice(0, 33), 90, y + 45);
    if (options.coordinates && p.coordinate) {
      ctx.font = "20px sans-serif";
      ctx.fillText(
        `${p.coordinate.latitude}, ${p.coordinate.longitude} · ${p.coordinate.crs}`,
        90,
        y + 85,
      );
    }
    if (options.photos && p.photoIds[0]) {
      const media = await db.media.get(p.photoIds[0]);
      if (media) {
        const bmp = await createImageBitmap(media.blob);
        ctx.drawImage(bmp, 850, y - 20, 130, 100);
        bmp.close();
      }
    }
    y += 180;
  }
  ctx.fillStyle = "#6A4B3C";
  ctx.font = "26px sans-serif";
  ctx.fillText("让每一份关心，都有温暖的落点。", 80, 1280);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("卡片生成失败"))),
      "image/png",
    ),
  );
  return new File([blob], "WarmSip-暖迹卡片.png", { type: "image/png" });
}
