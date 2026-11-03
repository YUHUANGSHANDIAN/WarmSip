import { Temporal } from "@js-temporal/polyfill";
import type { Capsule, Profile } from "../domain";
export function capsuleOpenInstant(date: string, timeZone: string) {
  return Temporal.PlainDate.from(date).toZonedDateTime(timeZone)
    .epochMilliseconds;
}
export function canOpen(
  capsule: Pick<Capsule, "openDate" | "timeZone">,
  now = Date.now(),
) {
  try {
    return now >= capsuleOpenInstant(capsule.openDate, capsule.timeZone);
  } catch {
    return false;
  }
}
export function localDate(
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  return Temporal.Now.plainDateISO(timeZone).toString();
}
export function upcomingAnniversaries(
  profiles: Profile[],
  today = Temporal.Now.plainDateISO(),
) {
  return profiles
    .flatMap((p) =>
      p.anniversaries.map((a) => {
        const original = Temporal.PlainDate.from(a.date);
        let next = original.with(
          { year: today.year },
          { overflow: "constrain" },
        );
        if (Temporal.PlainDate.compare(next, today) < 0)
          next = original.with(
            { year: today.year + 1 },
            { overflow: "constrain" },
          );
        return {
          profile: p,
          name: a.name,
          date: next.toString(),
          days: today.until(next).days,
        };
      }),
    )
    .sort((a, b) => a.days - b.days);
}
