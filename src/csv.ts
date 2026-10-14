export const safeCsvCell = (value: string | number) => {
  const text = String(value);
  return `"${(/^[\s]*[=+@-]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
};
