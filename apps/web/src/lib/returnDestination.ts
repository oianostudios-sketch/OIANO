export function safeReturnDestination(value: string | null): string | null {
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  const parsed = new URL(value, 'https://oiano.invalid');
  if (parsed.origin !== 'https://oiano.invalid' || parsed.pathname.startsWith('//')) return null;
  return value;
}
