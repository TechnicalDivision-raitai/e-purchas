import {
  useId,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';

export function normalizeSuggestValue(value: string): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function collectNormalizedSuggestions(
  rawValues: Array<string | undefined | null>,
): string[] {
  const seen = new Map<string, string>();
  for (const raw of rawValues) {
    const normalized = normalizeSuggestValue(raw || '');
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'th'));
}

interface AutoSuggestInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChangeValue: (nextValue: string) => void;
  suggestions: string[];
  minCharsToSuggest?: number;
  maxSuggestions?: number;
}

export function AutoSuggestInput({
  value,
  onChangeValue,
  suggestions,
  minCharsToSuggest = 1,
  maxSuggestions = 8,
  className = '',
  onFocus,
  onBlur,
  onKeyDown,
  ...rest
}: AutoSuggestInputProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const blurTimerRef = useRef<number | null>(null);

  const normalizedQuery = useMemo(() => normalizeSuggestValue(value), [value]);

  const matched = useMemo(() => {
    if (normalizedQuery.length < minCharsToSuggest) return [];
    const lowerQuery = normalizedQuery.toLowerCase();
    const cleaned = collectNormalizedSuggestions(suggestions);
    const filtered = cleaned.filter((item) => {
      const lowerItem = item.toLowerCase();
      return lowerItem.includes(lowerQuery) && lowerItem !== lowerQuery;
    });
    return filtered.slice(0, maxSuggestions);
  }, [normalizedQuery, minCharsToSuggest, suggestions, maxSuggestions]);

  const showList = open && matched.length > 0;

  const selectSuggestion = (item: string) => {
    onChangeValue(item);
    setOpen(false);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (showList) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % matched.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + matched.length) % matched.length);
        return;
      }
      if (e.key === 'Enter' && highlightedIndex >= 0 && matched[highlightedIndex]) {
        e.preventDefault();
        selectSuggestion(matched[highlightedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        setHighlightedIndex(-1);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative w-full">
      <input
        {...rest}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listboxId : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          onChangeValue(e.target.value);
          setOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={(e) => {
          if (blurTimerRef.current !== null) {
            window.clearTimeout(blurTimerRef.current);
          }
          if (normalizeSuggestValue(e.target.value).length >= minCharsToSuggest) {
            setOpen(true);
          }
          onFocus?.(e);
        }}
        onBlur={(e) => {
          blurTimerRef.current = window.setTimeout(() => {
            setOpen(false);
            setHighlightedIndex(-1);
          }, 120);
          onBlur?.(e);
        }}
        onKeyDown={handleKeyDown}
        className={className}
      />

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute right-0 left-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-[#c6d9ec] bg-white py-1 shadow-lg"
        >
          {matched.map((item, idx) => {
            const active = idx === highlightedIndex;
            return (
              <li
                key={item}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectSuggestion(item);
                }}
                onMouseEnter={() => setHighlightedIndex(idx)}
                title={item}
                className={`cursor-pointer px-3 py-2 text-xs whitespace-nowrap truncate ${
                  active
                    ? 'bg-[#edf5fd] font-medium text-[#1762ce]'
                    : 'text-[#2e4661] hover:bg-[#f4f8fd]'
                }`}
              >
                {item}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
