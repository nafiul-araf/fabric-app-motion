//-----------------------------------------------------------------------
// Cross-filtering, Power BI style. Clicking a member (bar, slice, funnel
// row, month point, table row) in one visual selects it; every OTHER
// visual on the page — and the KPI strip and island — re-queries with
// that member as a filter, while the clicked visual stays unfiltered and
// just highlights its selection. Ctrl/⌘/Shift-click adds members; clicking
// a selected member again, clicking empty plot space, Esc, or the ✕ on the
// selection chip clears it. The selection is per page.
//
// Charts use only `useSelection()` (provided per chart by ChartFrame from
// the query's `crossFilter` field) — they never see filters or queries.
//-----------------------------------------------------------------------

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CrossFilterField, Row } from "@/data/types";
import type { Filters } from "@/data/filters";

export interface Selection {
    field: CrossFilterField;
    /** Selected members (raw values of `field.key`). */
    values: Array<string | number>;
    /** Display names, parallel to `values` (e.g. "Mar '26" for 202603). */
    displays: string[];
    /** Card id (index on the page) of the visual that owns the selection. */
    source: number;
}

interface CrossFilterState {
    selection: Selection | null;
    setSelection: (s: Selection | null) => void;
}

const CrossFilterContext = createContext<CrossFilterState>({ selection: null, setSelection: () => {} });

export function CrossFilterProvider({ value, children }: { value: CrossFilterState; children: ReactNode }) {
    return <CrossFilterContext.Provider value={value}>{children}</CrossFilterContext.Provider>;
}

export function useCrossFilter(): CrossFilterState {
    return useContext(CrossFilterContext);
}

/**
 * The filters a visual should query with: the page filters plus the active
 * selection — unless this visual (card id) is the selection's source.
 * Pass no card id for page-wide consumers (KPI strip, island).
 */
export function withSelection(filters: Filters, selection: Selection | null, card?: number): Filters {
    if (!selection || selection.values.length === 0 || selection.source === card) return filters;
    return {
        ...filters,
        extra: [...(filters.extra ?? []), { dim: selection.field.dim, values: selection.values }],
    };
}

/** Card id (its index on the page) of the enclosing Card; -1 outside a card. */
export const CardIdContext = createContext<number>(-1);

/** What a chart needs to make its marks selectable. */
export interface SelectionApi {
    /** The visual declared a cross-filter field and sits in a card. */
    enabled: boolean;
    /** This visual owns the active selection — highlight selected marks, dim the rest. */
    active: boolean;
    /** The member a row stands for (raw value of the field), or null. */
    keyOf: (row: Row) => string | number | null;
    /** True when this visual is the source and the row's member is selected. */
    isSelected: (row: Row) => boolean;
    /** Click on a mark: select its member (Ctrl/⌘/Shift adds; clicking a selected member removes it). */
    toggle: (row: Row, e?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => void;
    /** Click on empty plot space while active: clear the selection. */
    clear: () => void;
}

const NOOP: SelectionApi = {
    enabled: false,
    active: false,
    keyOf: () => null,
    isSelected: () => false,
    toggle: () => {},
    clear: () => {},
};

const SelectionApiContext = createContext<SelectionApi>(NOOP);

export function SelectionApiProvider({ value, children }: { value: SelectionApi; children: ReactNode }) {
    return <SelectionApiContext.Provider value={value}>{children}</SelectionApiContext.Provider>;
}

/** For chart plots: the selection API of the chart they render. */
export function useSelection(): SelectionApi {
    return useContext(SelectionApiContext);
}

const sameField = (a: CrossFilterField, b: CrossFilterField) => a.dim === b.dim;

/** Build a chart's selection API from its query's cross-filter field (used by ChartFrame). */
export function useSelectionApi(field: CrossFilterField | undefined): SelectionApi {
    const { selection, setSelection } = useCrossFilter();
    const card = useContext(CardIdContext);
    const fDim = field?.dim;
    const fKey = field?.key;
    const fLabel = field?.label;
    const fDisplay = field?.displayKey;

    return useMemo<SelectionApi>(() => {
        if (!fDim || !fKey || card < 0) return NOOP;
        const f: CrossFilterField = { dim: fDim, key: fKey, label: fLabel ?? fDim, displayKey: fDisplay };
        const keyOf = (row: Row): string | number | null => {
            const v = row[f.key];
            return typeof v === "number" || typeof v === "string" ? v : null;
        };
        const displayOf = (row: Row): string => {
            const d = f.displayKey ? row[f.displayKey] : row[f.key];
            return d == null || d === "" ? "(Blank)" : String(d);
        };
        // This chart's own selection (narrowed copy for the closures below).
        const own = selection != null && selection.source === card && sameField(selection.field, f) ? selection : null;
        const active = own != null && own.values.length > 0;
        return {
            enabled: true,
            active,
            keyOf,
            isSelected: (row) => {
                if (!own) return false;
                const v = keyOf(row);
                return v != null && own.values.includes(v);
            },
            toggle: (row, e) => {
                const v = keyOf(row);
                if (v == null) return;
                const additive = !!(e?.ctrlKey || e?.metaKey || e?.shiftKey);
                if (own) {
                    const at = own.values.indexOf(v);
                    if (at >= 0) {
                        // Clicking a selected member removes it (the last one clears).
                        const values = own.values.filter((_, i) => i !== at);
                        const displays = own.displays.filter((_, i) => i !== at);
                        setSelection(values.length ? { ...own, values, displays } : null);
                        return;
                    }
                    if (additive) {
                        setSelection({ ...own, values: [...own.values, v], displays: [...own.displays, displayOf(row)] });
                        return;
                    }
                }
                setSelection({ field: f, values: [v], displays: [displayOf(row)], source: card });
            },
            clear: () => {
                if (own) setSelection(null);
            },
        };
    }, [fDim, fKey, fLabel, fDisplay, card, selection, setSelection]);
}

/** For pages: `xf(card)` = the filters that card's query should use. */
export function useCardFilters(filters: Filters): (card: number) => Filters {
    const { selection } = useCrossFilter();
    return (card: number) => withSelection(filters, selection, card);
}
