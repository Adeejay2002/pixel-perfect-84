import { useEffect, useMemo, useRef, useState } from "react";
import {
  Asterisk, Barcode, Hash, Tag, Search, Keyboard,
  ChevronFirst, ChevronLeft, ChevronRight, ChevronLast,
} from "lucide-react";
import { usePos, money, discountedPrice } from "../../lib/pos/store";

const PAGE_SIZE = 15;

// red border = out / low / expired, amber = expiring soon
function tileBorder(info) {
  if (info?.stock || info?.expiry === "expired") return "border-pos-red";
  if (info?.expiry === "soon") return "border-pos-amber";
  return "border-pos-border";
}

function StockBadges({ info, stock }) {
  if (!info) return null;
  return (
    <>
      {info.stock === "out" && (
        <span className="absolute left-2 top-2 rounded bg-pos-red px-1 text-[9px] font-bold uppercase text-white">Out of stock</span>
      )}
      {info.stock === "low" && (
        <span className="absolute left-2 top-2 flex items-center gap-1 text-[9px] font-bold uppercase text-pos-red">
          <span className="h-2 w-2 animate-pos-blink rounded-full bg-pos-red" /> Low · {stock} left
        </span>
      )}
      {info.expiry && (
        <span
          className={`absolute bottom-1.5 left-1.5 rounded px-1 text-[9px] font-bold ${
            info.expiry === "expired" ? "bg-pos-red text-white" : "bg-pos-amber text-black"
          }`}
        >
          {info.expiry === "expired" ? "Expired" : info.days === 0 ? "Exp today" : `Exp ${info.days}d`}
        </span>
      )}
    </>
  );
}

export default function ProductWorkspace({ searchRef }) {
  const { products, addLine, addLineByCode, settings, categories, stockAlerts } = usePos();
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(null);
  const [page, setPage] = useState(0);
  const localRef = useRef(null);
  const inputRef = searchRef || localRef;
  const lastScanRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  const onSearchKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const now = Date.now();
    if (now - lastScanRef.current < 250) return;
    lastScanRef.current = now;
    const added = addLineByCode(query.trim());
    if (added) {
      setQuery("");
      setPage(0);
    }
    inputRef.current?.focus();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      if (filter === "barcode") return p.barcode.includes(q);
      if (filter === "code") return p.code.includes(q);
      if (filter === "tag") return p.category.toLowerCase().includes(q);
      return (
        p.name.toLowerCase().includes(q) || p.code.includes(q) || p.barcode.includes(q)
      );
    });
  }, [products, query, filter, category]);

  const categoryTiles = (categories || []).map((c) => ({ ...c, type: "category" }));
  const tiles = category || query ? filtered : [...categoryTiles, ...filtered];
  const pages = Math.max(1, Math.ceil(tiles.length / PAGE_SIZE));
  const current = tiles.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const filters = [
    { id: "all", icon: Asterisk },
    { id: "barcode", icon: Barcode },
    { id: "code", icon: Hash },
    { id: "tag", icon: Tag },
  ];

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-pos-bg">
      <div className="flex items-center gap-2 border-b border-pos-border px-3 py-2.5">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`flex h-9 w-9 items-center justify-center rounded-md border border-pos-border transition-colors ${
              filter === f.id ? "bg-pos-blue text-white" : "bg-pos-tile text-muted-foreground hover:bg-pos-hover"
            }`}
          >
            <f.icon size={16} />
          </button>
        ))}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Search products by name, code or barcode"
            className="h-9 w-full rounded-md border border-pos-border bg-pos-tile pl-9 pr-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-pos-blue"
          />
          <Keyboard className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        </div>
      </div>

      {category && (
        <div className="px-3 pt-2">
          <button
            type="button"
            onClick={() => setCategory(null)}
            className="rounded bg-pos-tile px-2 py-1 text-xs text-muted-foreground hover:bg-pos-hover"
          >
            ← All products · {category}
          </button>
        </div>
      )}

      <div className="grid flex-1 auto-rows-min grid-cols-3 content-start gap-2 overflow-auto p-3 sm:grid-cols-4 xl:grid-cols-5">
        {current.map((t) =>
          t.type === "category" ? (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setCategory(t.name);
                setPage(0);
              }}
              className={`aspect-square rounded-md p-3 text-left text-sm font-semibold text-white transition-transform hover:scale-[1.02] ${
                t.tone === "blue" ? "bg-pos-blue" : "bg-pos-purple"
              }`}
            >
              {t.name}
            </button>
          ) : (
            <button
              key={t.id}
              type="button"
              onClick={() => addLine(t)}
              className={`relative flex aspect-square flex-col overflow-hidden rounded-md border bg-pos-tile p-2 transition-colors hover:bg-pos-hover ${tileBorder(
                stockAlerts.byProduct.get(t.id),
              )}`}
            >
              <StockBadges info={stockAlerts.byProduct.get(t.id)} stock={t.stock} />
              {t.modifiers && <span className="absolute right-2 top-1.5 text-sm text-pos-amber">*</span>}
              {t.discountPercent > 0 && (
                <span className="absolute right-1.5 bottom-1.5 rounded bg-pos-amber px-1 text-[9px] font-bold text-black">
                  -{t.discountPercent}%
                </span>
              )}
              <div className="mt-4 flex flex-1 items-center justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-pos-thumb text-base font-bold text-muted-foreground">
                  {t.name.slice(0, 2).toUpperCase()}
                </div>
              </div>
              <span className="line-clamp-2 text-center text-xs font-medium text-foreground">{t.name}</span>
              <span className="mt-1 flex items-center justify-center gap-1 text-center text-[11px]">
                {t.discountPercent > 0 && (
                  <span className="text-muted-foreground line-through">{money(t.price, settings.currency)}</span>
                )}
                <span className="text-pos-green">{money(discountedPrice(t), settings.currency)}</span>
              </span>

            </button>
          ),
        )}
      </div>

      <div className="flex h-11 items-center justify-end gap-1 border-t border-pos-border px-3">
        <span className="mr-2 text-xs text-muted-foreground">
          Page {page + 1} / {pages}
        </span>
        {[
          { icon: ChevronFirst, to: 0 },
          { icon: ChevronLeft, to: Math.max(0, page - 1) },
          { icon: ChevronRight, to: Math.min(pages - 1, page + 1) },
          { icon: ChevronLast, to: pages - 1 },
        ].map((b, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setPage(b.to)}
            className="flex h-8 w-8 items-center justify-center rounded border border-pos-border bg-pos-tile text-muted-foreground hover:bg-pos-hover"
          >
            <b.icon size={15} />
          </button>
        ))}
      </div>
    </section>
  );
}
