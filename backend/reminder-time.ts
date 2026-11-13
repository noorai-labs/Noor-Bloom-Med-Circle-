// Resolve wall-clock times in an IANA zone, including DST gaps and repeated hours.
const formatters = new Map<string, Intl.DateTimeFormat>();
export function localParts(at: number, timezone: string) {
  let formatter = formatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    if (formatters.size >= 64) formatters.clear();
    formatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(at);
  const p = Object.fromEntries(parts.map((v) => [v.type, v.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${p.hour}:${p.minute}`,
    epoch: Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute),
  };
}
export function nextDaily(
  after: number,
  time: string,
  timezone: string,
): number {
  const day = localParts(after, timezone).date;
  const base = Date.parse(day + "T00:00:00Z");
  const [hour, minute] = time.split(":").map(Number);
  for (let d = 0; d < 4; d++) {
    const nominal = base + d * 86400000 + hour * 3600000 + minute * 60000;
    const date = new Date(base + d * 86400000).toISOString().slice(0, 10);
    const offsets = new Set(
      [-36, -12, 0, 12, 36].map((h) => {
        const sample = nominal + h * 3600000;
        return (
          localParts(sample, timezone).epoch -
          Math.floor(sample / 60000) * 60000
        );
      }),
    );
    const candidates = [...offsets]
      .map((offset) => nominal - offset)
      .filter((at) => {
        const local = localParts(at, timezone);
        return at > after && local.date === date && local.time === time;
      })
      .sort((a, b) => a - b);
    if (candidates.length) return candidates[0];
  }
  throw new Error("Cannot resolve the next reminder time.");
}
