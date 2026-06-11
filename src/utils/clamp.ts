export function clampInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const input = value === undefined || !Number.isFinite(value) ? fallback : value;

  return Math.min(Math.max(Math.floor(input), minimum), maximum);
}
