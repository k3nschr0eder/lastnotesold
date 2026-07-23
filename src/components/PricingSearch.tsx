import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { mockSuggestions, type NoteSuggestion } from "./mockData";

interface PricingSearchProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
}

const SERIES_OPTIONS = [
  { value: "", label: "All Series" },
  { value: "1934", label: "1934 Series" },
  { value: "1928", label: "1928 Series" },
  { value: "1953", label: "1953 Series" },
  { value: "1899", label: "1899 Series" },
  { value: "1914", label: "1914 Series" },
  { value: "1922", label: "1922 Series" },
];

export default function PricingSearch({
  onSearch,
  isLoading = false,
}: PricingSearchProps) {
  const [query, setQuery] = useState("");
  const [series, setSeries] = useState("");
  const [suggestions, setSuggestions] = useState<NoteSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const lower = query.toLowerCase();
    const filtered = mockSuggestions
      .filter(
        (s) =>
          s.label.toLowerCase().includes(lower) ||
          s.category.toLowerCase().includes(lower),
      )
      .slice(0, 8);

    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
    setActiveIndex(-1);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /** Build the final query by inserting the series after the year (e.g. "1928 $2 Red Seal") */
  const buildQuery = (q: string): string => {
    const trimmed = q.trim();
    if (!trimmed) return series || "";
    if (!series) return trimmed;
    return `${series} ${trimmed}`;
  };

  const handleSearch = (q: string) => {
    const finalQuery = buildQuery(q);
    if (!finalQuery) {
      // Focus the input so user can type
      inputRef.current?.focus();
      return;
    }
    setShowSuggestions(false);
    onSearch(finalQuery);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        setQuery(suggestions[activeIndex].label);
        handleSearch(suggestions[activeIndex].label);
      } else {
        handleSearch(query);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="w-full max-w-2xl">
      <div className="relative">
        {/* Search input row */}
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Text input */}
          <div className="relative flex-1 order-2 sm:order-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              placeholder="e.g. 1928 $2 Red Seal"
              className="w-full rounded-xl border border-emerald-800/40 bg-gray-800 py-4 pl-5 pr-12 text-lg text-white placeholder-gray-500 shadow-lg shadow-emerald-900/10 transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              disabled={isLoading}
            />
            {/* Clear button */}
            {query && !isLoading && (
              <button
                onClick={() => {
                  setQuery("");
                  setSuggestions([]);
                  setShowSuggestions(false);
                  inputRef.current?.focus();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors"
                aria-label="Clear search"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            )}
            {/* Loading spinner */}
            {isLoading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              </div>
            )}
          </div>

          {/* Series dropdown */}
          <div className="relative order-3 sm:order-2">
            <select
              value={series}
              onChange={(e) => setSeries(e.target.value)}
              className="h-full w-full appearance-none rounded-xl border border-emerald-800/40 bg-gray-800 py-4 pl-4 pr-10 text-base text-white shadow-lg shadow-emerald-900/10 transition-all focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 sm:w-auto sm:min-w-[130px]"
              disabled={isLoading}
            >
              {SERIES_OPTIONS.map((s) => (
                <option key={s.value} value={s.value} className="bg-gray-800 text-white">
                  {s.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>

          {/* Search button */}
          <button
            type="button"
            onClick={() => handleSearch(query)}
            disabled={isLoading}
            className="order-4 sm:order-3 flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-4 text-lg font-bold text-gray-950 shadow-lg shadow-emerald-500/30 transition-all hover:bg-emerald-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            Price It
          </button>
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-emerald-800/30 bg-gray-800 shadow-2xl shadow-black/50 sm:left-[140px]"
          >
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.label}
                onClick={() => {
                  setQuery(suggestion.label);
                  handleSearch(suggestion.label);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full flex-col items-start px-5 py-3 text-left transition-colors ${
                  index === activeIndex
                    ? "bg-emerald-900/30 text-white"
                    : "text-gray-300 hover:bg-gray-750"
                }`}
              >
                <span className="text-sm font-medium">{suggestion.label}</span>
                <span className="mt-0.5 text-xs text-gray-500">
                  {suggestion.category}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}