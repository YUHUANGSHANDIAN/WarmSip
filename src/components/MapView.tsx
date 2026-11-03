import { useEffect, useRef, useState } from "react";
import { LocateFixed, MapPin, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import type { Coordinate, PlaceRecord } from "../domain";
import {
  createMapProvider,
  type MapProviderAdapter,
  type Viewport,
} from "../services/map";
import { services } from "../services/api";
import { platform } from "../platform";
import { useAction, useNotice } from "./ui";
const views = new Map<string, { viewport?: Viewport; selected?: string }>();
export function getSavedMapView(id: string) {
  return views.get(id);
}
export function saveSelectedPlace(id: string, selected: string) {
  views.set(id, { ...views.get(id), selected });
}
export function MapView({
  id,
  city,
  places,
  selected,
  focusId,
  focusSequence,
  onSelect,
  onViewport,
  onPick,
  picking = false,
}: {
  id: string;
  city: string;
  places: PlaceRecord[];
  selected?: string;
  focusId?: string;
  focusSequence?: number;
  onSelect: (id: string) => void;
  onViewport?: (v: Viewport) => void;
  onPick?: (c: Coordinate) => void;
  picking?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const provider = useRef<MapProviderAdapter | undefined>(undefined);
  const callbacks = useRef({ onSelect, onViewport, onPick, picking });
  callbacks.current = { onSelect, onViewport, onPick, picking };
  const latest = useRef({ places, selected });
  latest.current = { places, selected };
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const notice = useNotice();
  const { run, busy } = useAction();
  useEffect(() => {
    let active = true;
    let current: MapProviderAdapter | undefined;
    const controller = new AbortController();
    setError("");
    setReady(false);
    void services
      .capabilities(controller.signal)
      .then(async (cap) => {
        if (!active || !container.current) return;
        current = await createMapProvider(container.current, cap, {
          city,
          initial: views.get(id)?.viewport,
          onSelect: (key) => callbacks.current.onSelect(key),
          onMove: (viewport) => {
            views.set(id, { ...views.get(id), viewport });
            callbacks.current.onViewport?.(viewport);
          },
          onPick: (c) => {
            if (callbacks.current.picking) callbacks.current.onPick?.(c);
          },
        });
        if (!active) {
          current.destroy();
          return;
        }
        provider.current = current;
        setReady(true);
        await current.setPlaces(latest.current.places, latest.current.selected);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : "地图暂不可用");
      });
    const resize = () => provider.current?.resize();
    window.addEventListener("resize", resize);
    return () => {
      active = false;
      controller.abort();
      current?.destroy();
      provider.current = undefined;
      window.removeEventListener("resize", resize);
    };
  }, [id, city, attempt]);
  useEffect(() => {
    if (ready)
      void provider.current
        ?.setPlaces(places, selected)
        .catch((e) =>
          setError(e instanceof Error ? e.message : "地点渲染失败"),
        );
  }, [places, selected, ready]);
  useEffect(() => {
    if (ready && focusId) provider.current?.focus(focusId);
  }, [focusId, focusSequence, ready]);
  return (
    <div className={`map-canvas ${picking ? "picking" : ""}`}>
      <div className="map-surface" ref={container} aria-label="暖迹地图底图" />
      {!ready && (
        <div className="map-unavailable">
          <div className="offline-map-icon">
            <MapPin size={38} />
          </div>
          <span className="eyebrow">YOUR PLACES STAY WITH YOU</span>
          <h2>{error ? "暖迹一直在，底图稍后见" : "正在连接地图底图…"}</h2>
          <p>{error || "正在准备地图服务。"}</p>
          {error && (
            <>
              <span className="map-note">
                已保存的地点和照片仍可在列表查看、编辑。
                <br />
                添加坐标或手动地点无需连接地图服务。
              </span>
              <div className="form-actions">
                <Link to="/settings" className="button secondary">
                  配置在线服务
                </Link>
                <button
                  className="button ghost"
                  onClick={() => setAttempt((x) => x + 1)}
                >
                  <RefreshCw size={16} />
                  重试
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {ready && (
        <>
          <div className="map-copyright">
            底图与地点服务 © 高德地图 · 坐标 GCJ-02
          </div>
          <button
            className="map-locate icon-button"
            aria-label="定位到我的位置"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                const coordinate = await platform.locate();
                await provider.current?.center(coordinate);
                notice({ text: "已定位到你的设备位置" });
              });
            }}
          >
            <LocateFixed />
          </button>
          {picking && (
            <div className="map-pick-hint">点击地图，选择这个地点的位置</div>
          )}
        </>
      )}
    </div>
  );
}
