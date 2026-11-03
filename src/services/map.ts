import type { Coordinate, PlaceRecord, Capabilities } from "../domain";
import { coordinateSchema, statusLabels } from "../domain";
import { getSettings } from "../storage/db";

export interface Viewport {
  center: Coordinate;
  zoom: number;
  bounds: { west: number; east: number; south: number; north: number };
  visibleIds?: string[];
}
export interface MapProviderAdapter {
  setPlaces: (places: PlaceRecord[], selected?: string) => Promise<void>;
  focus: (id: string) => void;
  center: (coordinate: Coordinate) => Promise<void>;
  getViewport: () => Viewport;
  destroy: () => void;
  resize: () => void;
}
interface LngLat {
  getLng: () => number;
  getLat: () => number;
}
interface Marker {
  on: (event: string, fn: () => void) => void;
  setMap: (map: NativeMap | null) => void;
  setContent: (content: HTMLElement) => void;
}
interface NativeMap {
  on: (event: string, fn: (event: { lnglat?: LngLat }) => void) => void;
  off: (event: string, fn: (event: { lnglat?: LngLat }) => void) => void;
  setCity: (city: string) => void;
  getCenter: () => LngLat;
  getZoom: () => number;
  getBounds: () => { getSouthWest: () => LngLat; getNorthEast: () => LngLat };
  setCenter: (position: number[], immediately?: boolean) => void;
  setZoomAndCenter: (zoom: number, position: number[]) => void;
  destroy: () => void;
  resize: () => void;
}
interface Cluster {
  setMap: (map: NativeMap | null) => void;
}
interface AMapAPI {
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>,
  ) => NativeMap;
  Marker: new (options: Record<string, unknown>) => Marker;
  Pixel: new (x: number, y: number) => unknown;
  MarkerCluster: new (
    map: NativeMap,
    data: unknown[],
    options: Record<string, unknown>,
  ) => Cluster;
  plugin: (names: string[], callback: () => void) => void;
  convertFrom: (
    coordinates: number[][],
    type: string,
    callback: (status: string, result: { locations?: LngLat[] }) => void,
  ) => void;
}
declare global {
  interface Window {
    AMap?: AMapAPI;
    _AMapSecurityConfig?: { serviceHost: string };
  }
}
let loader: Promise<AMapAPI> | undefined;
let loadedKey = "";
export async function loadAMap(capabilities: Capabilities) {
  if (!capabilities.map)
    throw new Error("地图底图尚未配置，本地地点仍可查看和编辑");
  const settings = await getSettings();
  const serviceHost = new URL(capabilities.mapProxyUrl, settings.serviceUrl)
    .href;
  if (loader && loadedKey === capabilities.mapJsKey) {
    window._AMapSecurityConfig = { serviceHost };
    return loader;
  }
  if (window.AMap && loadedKey && loadedKey !== capabilities.mapJsKey)
    throw new Error("地图配置已更改，请重新加载应用");
  window._AMapSecurityConfig = { serviceHost };
  loadedKey = capabilities.mapJsKey;
  loader = new Promise<AMapAPI>((resolve, reject) => {
    if (window.AMap) {
      resolve(window.AMap);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(capabilities.mapJsKey)}`;
    script.async = true;
    const timeout = setTimeout(() => {
      script.remove();
      loader = undefined;
      reject(new Error("地图加载超时，请检查网络"));
    }, 15000);
    script.onload = () => {
      clearTimeout(timeout);
      if (window.AMap) resolve(window.AMap);
      else {
        loader = undefined;
        reject(new Error("地图 SDK 加载失败"));
      }
    };
    script.onerror = () => {
      clearTimeout(timeout);
      script.remove();
      loader = undefined;
      reject(new Error("地图底图暂时无法连接，本地记录不受影响"));
    };
    document.head.append(script);
  });
  return loader;
}
export async function convertToGCJ(
  coordinate: Coordinate,
  api: AMapAPI,
): Promise<Coordinate> {
  if (coordinate.crs === "GCJ02") return coordinate;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("坐标转换超时")), 10000);
    api.convertFrom(
      [[coordinate.longitude, coordinate.latitude]],
      "gps",
      (status, result) => {
        clearTimeout(timer);
        const p = result.locations?.[0];
        if (status === "complete" && p) {
          const converted = coordinateSchema.safeParse({
            longitude: p.getLng(),
            latitude: p.getLat(),
            crs: "GCJ02",
          });
          if (converted.success) resolve(converted.data);
          else reject(new Error("地图提供方返回了无效坐标"));
        } else reject(new Error("坐标转换失败，未将不同坐标系混用"));
      },
    );
  });
}
export async function createMapProvider(
  element: HTMLElement,
  capabilities: Capabilities,
  options: {
    city: string;
    initial?: Viewport;
    onSelect: (id: string) => void;
    onMove: (viewport: Viewport) => void;
    onPick: (coordinate: Coordinate) => void;
  },
): Promise<MapProviderAdapter> {
  const api = await loadAMap(capabilities);
  const map = new api.Map(element, {
    zoom: options.initial?.zoom || 11,
    viewMode: "2D",
    mapStyle: "amap://styles/normal",
    ...(options.initial
      ? {
          center: [
            options.initial.center.longitude,
            options.initial.center.latitude,
          ],
        }
      : {}),
  });
  if (!options.initial && options.city) map.setCity(options.city);
  let disposed = false;
  let generation = 0;
  let markers: Marker[] = [];
  let cluster: Cluster | undefined;
  const positions = new Map<string, Coordinate>();
  const getViewport = (): Viewport => {
    const center = map.getCenter();
    const bounds = map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const viewport: Viewport = {
      center: {
        longitude: center.getLng(),
        latitude: center.getLat(),
        crs: "GCJ02",
      },
      zoom: map.getZoom(),
      bounds: {
        west: sw.getLng(),
        east: ne.getLng(),
        south: sw.getLat(),
        north: ne.getLat(),
      },
    };
    viewport.visibleIds = [...positions]
      .filter(([, c]) => insideViewport(c, viewport))
      .map(([id]) => id);
    return viewport;
  };
  const move = () => {
    if (!disposed) options.onMove(getViewport());
  };
  const pick = (event: { lnglat?: LngLat }) => {
    if (event.lnglat)
      options.onPick({
        longitude: event.lnglat.getLng(),
        latitude: event.lnglat.getLat(),
        crs: "GCJ02",
      });
  };
  map.on("moveend", move);
  map.on("zoomend", move);
  map.on("complete", move);
  map.on("click", pick);
  const content = (place: PlaceRecord, selected?: string) => {
    const button = document.createElement("button");
    button.className = `place-marker ${place.status} ${place.id === selected ? "selected" : ""}`;
    button.type = "button";
    button.setAttribute(
      "aria-label",
      `${place.name}，${statusLabels[place.status]}`,
    );
    button.title = place.name;
    button.textContent =
      place.status === "visited"
        ? "✓"
        : place.status === "gifted"
          ? "★"
          : place.status === "toGift"
            ? "♥"
            : "•";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onSelect(place.id);
    });
    return button;
  };
  return {
    async setPlaces(places, selected) {
      const seq = ++generation;
      const valid = places.filter((p) => p.coordinate);
      const converted = await Promise.all(
        valid.map(async (p) => ({
          place: p,
          coordinate: await convertToGCJ(p.coordinate!, api),
        })),
      );
      if (disposed || seq !== generation) return;
      for (const m of markers) m.setMap(null);
      markers = [];
      cluster?.setMap(null);
      cluster = undefined;
      positions.clear();
      for (const { place, coordinate } of converted)
        positions.set(place.id, coordinate);
      if (converted.length > 80) {
        await new Promise<void>((resolve) =>
          api.plugin(["AMap.MarkerCluster"], resolve),
        );
        if (disposed || seq !== generation) return;
        cluster = new api.MarkerCluster(
          map,
          converted.map(({ place, coordinate }) => ({
            lnglat: [coordinate.longitude, coordinate.latitude],
            extData: place,
          })),
          {
            gridSize: 64,
            renderMarker: (context: {
              marker: Marker;
              data: { extData: PlaceRecord }[];
            }) =>
              context.marker.setContent(
                content(context.data[0].extData, selected),
              ),
          },
        );
      } else
        for (const { place, coordinate } of converted) {
          const marker = new api.Marker({
            map,
            position: [coordinate.longitude, coordinate.latitude],
            content: content(place, selected),
            offset: new api.Pixel(-18, -36),
            zIndex: place.id === selected ? 200 : 100,
          });
          markers.push(marker);
        }
      move();
    },
    focus(id) {
      const position = positions.get(id);
      if (position) map.setCenter([position.longitude, position.latitude]);
    },
    async center(coordinate) {
      const c = await convertToGCJ(coordinate, api);
      if (!disposed) map.setZoomAndCenter(14, [c.longitude, c.latitude]);
    },
    getViewport,
    resize: () => map.resize(),
    destroy() {
      disposed = true;
      generation++;
      map.off("moveend", move);
      map.off("zoomend", move);
      map.off("complete", move);
      map.off("click", pick);
      cluster?.setMap(null);
      for (const m of markers) m.setMap(null);
      map.destroy();
    },
  };
}
export function insideViewport(
  coordinate: Coordinate | null,
  viewport: Viewport,
) {
  return (
    coordinate?.crs === "GCJ02" &&
    coordinate.longitude >= viewport.bounds.west &&
    coordinate.longitude <= viewport.bounds.east &&
    coordinate.latitude >= viewport.bounds.south &&
    coordinate.latitude <= viewport.bounds.north
  );
}
