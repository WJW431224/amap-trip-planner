import { useEffect, useRef, useState } from 'react';
import { Close, MapPin, Search } from '../../components/Icons';
import type { LngLat } from '../../types';

export interface PlaceResult {
  id?: string;
  name: string;
  address?: string;
  coord: LngLat;
}

interface SearchBoxProps {
  amap: any;
  city: string;
  onCityChange: (city: string) => void;
  onPick: (place: PlaceResult) => void;
}

function normalizePoi(poi: any): PlaceResult | null {
  const location = poi?.location;
  if (!location) return null;

  const lng = Number(
    typeof location.getLng === 'function' ? location.getLng() : location.lng,
  );
  const lat = Number(
    typeof location.getLat === 'function' ? location.getLat() : location.lat,
  );
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const address = [poi.pname, poi.cityname, poi.adname, poi.address]
    .filter(Boolean)
    .join('');

  return {
    id: poi.id,
    name: poi.name || '未命名地点',
    address: address || undefined,
    coord: { lng, lat },
  };
}

export default function SearchBox({
  amap,
  city,
  onCityChange,
  onPick,
}: SearchBoxProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [cityDraft, setCityDraft] = useState(city);

  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<any>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setCityDraft(city);
  }, [city]);

  useEffect(() => {
    if (!amap) return;
    searchRef.current = new amap.PlaceSearch({
      city,
      citylimit: false,
      pageSize: 8,
      extensions: 'base',
    });
  }, [amap, city]);

  useEffect(() => {
    const onDocumentMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, []);

  useEffect(() => {
    const keyword = query.trim();
    const requestId = ++requestIdRef.current;

    if (keyword.length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      setSearched(false);
      return;
    }

    setLoading(true);
    setOpen(true);
    setSearched(false);

    const timer = window.setTimeout(() => {
      const service = searchRef.current;
      if (!service) return;

      service.search(keyword, (status: string, result: any) => {
        if (requestId !== requestIdRef.current) return;

        setLoading(false);
        setSearched(true);

        if (status !== 'complete') {
          setResults([]);
          return;
        }

        const pois = Array.isArray(result?.poiList?.pois)
          ? result.poiList.pois
          : [];
        setResults(
          pois
            .map(normalizePoi)
            .filter((poi: PlaceResult | null): poi is PlaceResult => Boolean(poi))
            .slice(0, 8),
        );
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query]);

  function commitCity() {
    const next = cityDraft.trim();
    if (next && next !== city) {
      onCityChange(next);
    } else {
      setCityDraft(city);
    }
  }

  function pick(place: PlaceResult) {
    onPick(place);
    setQuery('');
    setResults([]);
    setOpen(false);
    setSearched(false);
  }

  return (
    <div className="search-block" ref={rootRef}>
      <div className="search-head">
        <span className="section-kicker">搜索地点</span>
        <label className="city-edit">
          <span>城市</span>
          <input
            value={cityDraft}
            onChange={(event) => setCityDraft(event.target.value)}
            onBlur={commitCity}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setCityDraft(city);
                event.currentTarget.blur();
              }
            }}
            aria-label="公交规划城市"
            title="公交路线规划使用的城市"
          />
        </label>
      </div>

      <div className="search-input-wrap">
        <Search size={17} />
        <input
          className="search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setQuery('');
              setOpen(false);
            }
          }}
          placeholder="搜地点、地标、公交站…"
          aria-label="搜索地点"
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            className="search-clear"
            onClick={() => {
              setQuery('');
              setResults([]);
              setOpen(false);
            }}
            aria-label="清空搜索"
          >
            <Close size={14} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="search-results" role="listbox" aria-label="搜索结果">
          {loading ? (
            <div className="search-state">
              <span className="mini-spinner" />
              正在搜索…
            </div>
          ) : null}

          {!loading && results.length > 0
            ? results.map((place, index) => (
                <button
                  type="button"
                  className="search-result"
                  key={`${place.id ?? place.name}-${index}`}
                  onClick={() => pick(place)}
                >
                  <span className="search-result-icon">
                    <MapPin size={15} />
                  </span>
                  <span className="search-result-copy">
                    <strong>{place.name}</strong>
                    {place.address ? <small>{place.address}</small> : null}
                  </span>
                </button>
              ))
            : null}

          {!loading && searched && results.length === 0 ? (
            <div className="search-state">没找到，换个关键词或改城市试试。</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
