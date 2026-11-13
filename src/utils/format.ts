export function formatMoney(n: number | string | null | undefined): string {
  return Number(n || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function normalizeCodeKey(s: unknown): string {
  return String(s ?? '')
    .normalize('NFKC')
    .trim()
    .toUpperCase();
}

export function triggerDownloadUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
