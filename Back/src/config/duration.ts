export const DURATION_PATTERN = /^[1-9]\d*(s|m|h|d)$/;

const UNIT_TO_MS = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const;

export function parseDurationMs(value: string, settingName: string): number {
  const match = DURATION_PATTERN.exec(value);
  if (!match) {
    throw new Error(
      `${settingName} must be a positive integer followed by s, m, h, or d.`,
    );
  }

  const amount = Number(value.slice(0, -1));
  const unit = match[1] as keyof typeof UNIT_TO_MS;
  const milliseconds = amount * UNIT_TO_MS[unit];
  if (!Number.isSafeInteger(milliseconds)) {
    throw new Error(`${settingName} is outside the supported duration range.`);
  }
  return milliseconds;
}
