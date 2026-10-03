/** Dialogue targets are planning guidelines, not measured playback durations. */
export function getStoryDurationBudget(input: string) {
  const tokens = input.trim().toLowerCase().replaceAll('–', '-').replaceAll('—', '-')
    .split(' ').filter(Boolean);
  const unit = tokens.pop();
  const secondsPerUnit = unit && ({
    s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
    m: 60, min: 60, mins: 60, minute: 60, minutes: 60,
    h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
  } as Record<string, number>)[unit];
  const bounds = tokens.join('').split('-');
  if (!secondsPerUnit || bounds.length > 2 || bounds.some(value => !value)) return null;
  const values = bounds.map(Number);
  if (values.some(value => !Number.isFinite(value) || value <= 0)) return null;
  const minimum = values[0];
  const maximum = values[1] ?? minimum;
  if (maximum < minimum) return null;

  const midpointMinutes = ((minimum + maximum) / 2) * secondsPerUnit / 60;
  // Match the agreed anchors: 2 min = 140–200, 5 = 350–500, 10 = 700–950.
  const upperWords = midpointMinutes <= 5
    ? midpointMinutes * 100
    : midpointMinutes <= 10
      ? 500 + (midpointMinutes - 5) * 90
      : midpointMinutes * 95;

  return {
    targetSeconds: (minimum + maximum) / 2 * secondsPerUnit,
    maximumSeconds: maximum * secondsPerUnit,
    minimumDialogueWords: Math.max(1, Math.round(midpointMinutes * 70)),
    maximumDialogueWords: Math.max(1, Math.round(upperWords)),
  };
}
