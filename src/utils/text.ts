export function truncateText(
  text: string | null | undefined,
  maxLength: number,
): { text: string; truncated: boolean } {
  const value = text?.trim() ?? "";

  if (!value || value.length <= maxLength) {
    return { text: value, truncated: false };
  }

  return {
    text: `${value.slice(0, Math.max(0, maxLength - 3))}...`,
    truncated: true,
  };
}
