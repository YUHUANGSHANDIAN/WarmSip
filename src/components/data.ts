import { useLiveQuery } from "dexie-react-hooks";
import { useMemo } from "react";
import { db, currentTimeZone } from "../storage/db";
import { settingsSchema } from "../domain";
export function useData() {
  const profiles = useLiveQuery(
    () =>
      db.profiles
        .filter((x) => x.deletedAt === null)
        .reverse()
        .sortBy("updatedAt"),
    [],
    [],
  );
  const maps = useLiveQuery(
    () =>
      db.maps
        .filter((x) => x.deletedAt === null)
        .reverse()
        .sortBy("updatedAt"),
    [],
    [],
  );
  const places = useLiveQuery(
    () => db.places.filter((x) => x.deletedAt === null).toArray(),
    [],
    [],
  );
  const recommendations = useLiveQuery(
    () =>
      db.recommendations
        .filter((x) => x.deletedAt === null)
        .reverse()
        .sortBy("createdAt"),
    [],
    [],
  );
  const orders = useLiveQuery(
    () =>
      db.orders
        .filter((x) => x.deletedAt === null)
        .reverse()
        .sortBy("updatedAt"),
    [],
    [],
  );
  const capsules = useLiveQuery(
    () => db.capsules.filter((x) => x.deletedAt === null).sortBy("openDate"),
    [],
    [],
  );
  return { profiles, maps, places, recommendations, orders, capsules };
}
export function useSettings() {
  const settings = useLiveQuery(
    async () => (await db.settings.get("app")) ?? null,
    [],
  );
  return useMemo(
    () => ({
      ...settingsSchema.parse(settings ?? { timeZone: currentTimeZone() }),
      ready: settings !== undefined,
    }),
    [settings],
  );
}
