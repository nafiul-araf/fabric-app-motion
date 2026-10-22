//-----------------------------------------------------------------------
// The contract between the data layer and the visuals. A query is a
// cache key plus a function that computes the result; chart queries
// also describe their columns and, optionally, which dimension their
// marks stand for so clicking one can cross-filter the page.
//-----------------------------------------------------------------------

import type { DimKey } from "./filters";

export type Row = Record<string, unknown>;

/** A result column: `name` keys the row objects, `format` drives table formatting ("$#,0", "0.0%"). */
export interface ColumnDef {
    name: string;
    displayName: string;
    format?: string;
}

/** Anything the app can ask the data layer for. Same key → same result (cached). */
export interface Query<T> {
    key: string;
    run: () => T;
}

/** What a visual's marks stand for, so a click on one can filter the rest of the page. */
export interface CrossFilterField {
    /** Row column that holds the member ("Cat", "Sort", "Customer"). */
    key: string;
    /** Dimension the member belongs to. */
    dim: DimKey;
    /** Human name of the dimension ("Region", "Month"). */
    label: string;
    /** Row column to display when `key` is a code (month 202503 → "Mar '25"). */
    displayKey?: string;
}

/** A query whose result is a table of rows for a chart or table. */
export interface ChartQuery extends Query<Row[]> {
    columns: ColumnDef[];
    crossFilter?: CrossFilterField;
}
