export function parsePositiveInt(value: string) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}
