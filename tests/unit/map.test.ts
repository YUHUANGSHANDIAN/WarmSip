// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  createMapProvider,
  convertToGCJ,
  insideViewport,
} from "../../src/services/map";
import { newEntity, placeSchema } from "../../shared/domain";
vi.mock("../../src/storage/db", () => ({
  getSettings: async () => ({ serviceUrl: "https://service.example" }),
}));

describe("map adapter contract (simulated provider, not an AMap online test)", () => {
  it("converts GPS before filtering, links markers/cards and preserves a dragged viewport", async () => {
    const ll = (longitude: number, latitude: number) => ({
      getLng: () => longitude,
      getLat: () => latitude,
    });
    const center = vi.fn();
    const move = vi.fn();
    const select = vi.fn();
    const markerOptions: Record<string, unknown>[] = [];
    const api = {
      Map: class {
        on = vi.fn();
        off = vi.fn();
        setCity = vi.fn();
        getCenter = () => ll(120, 30);
        getZoom = () => 12;
        getBounds = () => ({
          getSouthWest: () => ll(119, 29),
          getNorthEast: () => ll(121, 31),
        });
        setCenter = center;
        setZoomAndCenter = vi.fn();
        destroy = vi.fn();
        resize = vi.fn();
      },
      Marker: class {
        constructor(options: Record<string, unknown>) {
          markerOptions.push(options);
        }
        on = vi.fn();
        setMap = vi.fn();
        setContent = vi.fn();
      },
      Pixel: class {},
      MarkerCluster: class {
        setMap = vi.fn();
      },
      plugin: vi.fn(),
      convertFrom: vi.fn(
        (
          _coords: unknown,
          _type: string,
          callback: (
            status: string,
            result: { locations?: ReturnType<typeof ll>[] },
          ) => void,
        ) => callback("complete", { locations: [ll(120.005, 30.005)] }),
      ),
    };
    window.AMap = api;
    const provider = await createMapProvider(
      document.createElement("div"),
      {
        map: true,
        mapJsKey: "test-key",
        mapProxyUrl: "/proxy",
        ai: false,
        places: true,
        weather: false,
      },
      { city: "杭州", onSelect: select, onMove: move, onPick: vi.fn() },
    );
    const place = placeSchema.parse({
      ...newEntity(),
      mapId: "map",
      name: "GPS point",
      coordinate: { longitude: 120, latitude: 30, crs: "WGS84" },
    });
    await provider.setPlaces([place]);
    expect(api.convertFrom).toHaveBeenCalled();
    expect(provider.getViewport().visibleIds).toContain(place.id);
    expect(place.coordinate?.crs).toBe("WGS84");
    (markerOptions[0].content as HTMLButtonElement).click();
    expect(select).toHaveBeenCalledWith(place.id);
    await provider.setPlaces([place], place.id);
    expect(center).not.toHaveBeenCalled();
    provider.focus(place.id);
    expect(center).toHaveBeenCalledWith([120.005, 30.005]);
    expect(insideViewport(place.coordinate, provider.getViewport())).toBe(
      false,
    );
    provider.destroy();
  });
  it("does not relabel GPS values when conversion fails", async () => {
    const api = {
      convertFrom: (
        _a: unknown,
        _b: unknown,
        callback: (status: string, result: unknown) => void,
      ) => callback("error", {}),
    };
    await expect(
      convertToGCJ(
        { longitude: 120, latitude: 30, crs: "WGS84" },
        api as Parameters<typeof convertToGCJ>[1],
      ),
    ).rejects.toThrow("坐标转换失败");
  });
});
