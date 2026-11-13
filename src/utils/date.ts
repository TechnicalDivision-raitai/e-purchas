function getBangkokDateParts(date: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(date)
    .filter((p) => p.type !== 'literal')
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  return {
    year: parts.year ?? '2026',
    month: parts.month ?? '01',
    day: parts.day ?? '01',
  };
}

export function todayBangkok(d: Date = new Date()): string {
  const p = getBangkokDateParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

export function currentFiscalYear(d: Date = new Date()): number {
  const p = getBangkokDateParts(d);
  return Number(p.year) + 543 + (Number(p.month) >= 10 ? 1 : 0);
}

export function isValidIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const parsed = Date.parse(s);
  if (Number.isNaN(parsed)) return false;
  return new Date(s).toISOString().slice(0, 10) === s;
}

export function formatThaiDate(s: string | undefined | null): string {
  if (!s) return '—';
  try {
    return new Intl.DateTimeFormat('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Bangkok',
    }).format(new Date(`${s}T12:00:00+07:00`));
  } catch {
    return s;
  }
}

export function formatThaiDateTime(s: string): string {
  try {
    return new Intl.DateTimeFormat('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Bangkok',
    }).format(new Date(s));
  } catch {
    return s;
  }
}

export function getFiscalYearOptions(selected?: number | string): number[] {
  const selectedNum = Number(selected) || 2570;
  const last = Math.max(2579, currentFiscalYear() + 5, selectedNum);
  const base = Array.from({ length: last - 2570 + 1 }, (_, i) => 2570 + i);
  if (selectedNum >= 2500 && selectedNum < 2570) {
    return [...base, selectedNum];
  }
  return base;
}

export function uid(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
    return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)))
      .map((n) => n.toString(16).padStart(8, '0'))
      .join('');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
