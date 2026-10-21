/**
 * Tier F runtime modules (Draft 0.2 §7.3.2), served from the sandbox runtime
 * route. react / react-dom / react/jsx-runtime are bundled from node_modules by
 * esbuild (one shared React instance via import-map externals). The TanStack
 * modules and the host design system are served as host-authored ESM here:
 * `@tanstack/react-table`/`-charts` ship faithful, compact shims (the real
 * packages are a host release action, §7.3.2 — out of scope for this POC), and
 * `@ogui/bridge` is the exact source the package publishes.
 *
 * Shims are plain ESM (no TSX/types) so the browser runs them directly; they
 * import `react` as a bare specifier resolved by the shell's import map.
 */

import { OGUI_BRIDGE_MODULE_SOURCE } from '@tanstack/ai-generative-ui'

/* ---- @host/ui — host design-system primitives, themed with --ui-* -------- */
const HOST_UI_SOURCE = /* js */ `
import { createElement as h } from 'react';

export function Card(props) {
  var head = props.title
    ? h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 } },
        h('div', { style: { fontSize: 17, fontWeight: 650, letterSpacing: '-.01em' } }, props.title),
        props.subtitle ? h('div', { style: { fontSize: 12, color: 'var(--ui-muted,#6b7280)' } }, props.subtitle) : null)
    : null;
  return h('div', {
    style: Object.assign({
      padding: '16px 18px', background: 'var(--ui-surface,#fff)',
      border: '1px solid var(--ui-border,#e5e7eb)', borderRadius: 'var(--ui-radius,14px)'
    }, props.style)
  }, head, props.children);
}

export function Button(props) {
  var rest = Object.assign({}, props); delete rest.style; delete rest.children; delete rest.tone;
  var bg = props.tone === 'danger' ? 'var(--ui-negative,#dc2626)' : 'var(--ui-accent,#2563eb)';
  return h('button', Object.assign({}, rest, {
    style: Object.assign({
      padding: '9px 12px', border: 0, borderRadius: 10, background: bg,
      color: 'var(--ui-accent-text,#fff)', fontSize: 13, fontWeight: 600, cursor: 'pointer'
    }, props.style)
  }), props.children);
}

export function Input(props) {
  return h('input', Object.assign({}, props, {
    style: Object.assign({
      padding: '8px 10px', border: '1px solid var(--ui-border,#e5e7eb)',
      borderRadius: 8, background: 'var(--ui-surface,#fff)', color: 'var(--ui-text,#111)', fontSize: 13
    }, props.style)
  }));
}

export function Slider(props) {
  var rest = Object.assign({}, props); delete rest.style; delete rest.label;
  return h('input', Object.assign({ type: 'range' }, rest, {
    style: Object.assign({ width: '100%', accentColor: 'var(--ui-accent,#2563eb)' }, props.style)
  }));
}

export function Select(props) {
  var rest = Object.assign({}, props); delete rest.style; delete rest.children; delete rest.options;
  var opts = props.options
    ? props.options.map(function (o, i) { return h('option', { key: i, value: o.value != null ? o.value : o }, o.label != null ? o.label : o); })
    : props.children;
  return h('select', Object.assign({}, rest, {
    style: Object.assign({
      padding: '8px 10px', border: '1px solid var(--ui-border,#e5e7eb)', borderRadius: 8,
      background: 'var(--ui-surface,#fff)', color: 'var(--ui-text,#111)', fontSize: 13
    }, props.style)
  }), opts);
}

export function Label(props) {
  var rest = Object.assign({}, props); delete rest.style; delete rest.children;
  return h('label', Object.assign({}, rest, {
    style: Object.assign({ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ui-muted,#64748b)', margin: '0 0 4px' }, props.style)
  }), props.children);
}

export function Checkbox(props) {
  var rest = Object.assign({}, props); delete rest.style;
  return h('input', Object.assign({ type: 'checkbox' }, rest, { style: Object.assign({ accentColor: 'var(--ui-accent,#2563eb)' }, props.style) }));
}
`

/* ---- @tanstack/react-table shim — headless sorting/model ----------------- */
const REACT_TABLE_SHIM = /* js */ `
export function getCoreRowModel() { return 'core'; }
export function getSortedRowModel() { return 'sorted'; }
export function getFilteredRowModel() { return 'filtered'; }
export function getPaginationRowModel() { return 'pagination'; }
export function flexRender(comp, ctx) { return typeof comp === 'function' ? comp(ctx) : comp; }
export function createColumnHelper() {
  return {
    accessor: function (key, col) {
      var base = typeof key === 'function' ? { accessorFn: key } : { accessorKey: key };
      return Object.assign(base, col || {});
    },
    display: function (col) { return col || {}; },
    group: function (col) { return col || {}; },
  };
}
// v7 compatibility alias — some models reach for useTable.
export function useTable(options) { return useReactTable(options); }

export function useReactTable(options) {
  var data = options.data || [];
  var sorting = (options.state && options.state.sorting) || [];
  var onSortingChange = options.onSortingChange;

  var cols = (options.columns || []).map(function (c) {
    var id = c.id || c.accessorKey;
    var accessor = c.accessorFn ? c.accessorFn : function (row) { return row[c.accessorKey]; };
    var columnDef = Object.assign({}, c);
    // Default cell renderer: show the accessor value (real Table behavior).
    if (typeof columnDef.cell === 'undefined') columnDef.cell = function (info) { return info.getValue(); };
    var col = {
      id: id,
      columnDef: columnDef,
      accessor: accessor,
      getToggleSortingHandler: function () {
        return function () {
          var cur = sorting[0];
          var next;
          if (!cur || cur.id !== id) next = [{ id: id, desc: false }];
          else if (!cur.desc) next = [{ id: id, desc: true }];
          else next = [];
          if (onSortingChange) onSortingChange(next);
        };
      },
      getIsSorted: function () {
        var s = sorting.find(function (x) { return x.id === id; });
        return s ? (s.desc ? 'desc' : 'asc') : false;
      }
    };
    return col;
  });

  var headers = cols.map(function (col) {
    return { id: col.id, column: col, getContext: function () { return { column: col }; } };
  });
  var headerGroups = [{ id: 'hg0', headers: headers }];

  var rows = data.map(function (d, i) { return { original: d, id: String(i) }; });
  if (sorting.length) {
    var s = sorting[0];
    var col = cols.find(function (c) { return c.id === s.id; });
    if (col) {
      rows = rows.slice().sort(function (a, b) {
        var av = col.accessor(a.original), bv = col.accessor(b.original);
        var r = av < bv ? -1 : av > bv ? 1 : 0;
        return s.desc ? -r : r;
      });
    }
  }

  var rowModel = {
    rows: rows.map(function (r) {
      return {
        id: r.id,
        original: r.original,
        getVisibleCells: function () {
          return cols.map(function (col) {
            return {
              id: r.id + '_' + col.id,
              column: col,
              getContext: function () {
                return { getValue: function () { return col.accessor(r.original); }, row: r, column: col };
              }
            };
          });
        }
      };
    })
  };

  return { getHeaderGroups: function () { return headerGroups; }, getRowModel: function () { return rowModel; } };
}
`

/* ---- @tanstack/react-charts shim — themed SVG bar chart ------------------ */
const REACT_CHARTS_SHIM = /* js */ `
import { createElement as h } from 'react';

export function Chart(props) {
  var options = props.options || {};
  var series = (options.data && options.data[0]) || { data: [] };
  var pts = series.data || [];
  var getX = (options.primaryAxis && options.primaryAxis.getValue) || function (d) { return d.primary; };
  var getY = ((options.secondaryAxes && options.secondaryAxes[0] && options.secondaryAxes[0].getValue)) || function (d) { return d.secondary; };
  var W = 320, H = 140, pad = 26;
  var vals = pts.map(getY);
  var max = Math.max.apply(null, vals.concat([1]));
  var n = pts.length || 1;
  var slot = (W - pad * 2) / n;
  var bw = slot * 0.6;
  var bars = pts.map(function (d, i) {
    var v = getY(d);
    var bh = Math.max(1, (v / max) * (H - pad * 2));
    var x = pad + i * slot + (slot - bw) / 2;
    var y = H - pad - bh;
    return h('g', { key: i },
      h('rect', { x: x, y: y, width: bw, height: bh, rx: 3, fill: 'var(--ui-accent,#2563eb)' }),
      h('text', { x: x + bw / 2, y: H - pad + 12, textAnchor: 'middle', fontSize: 9, fill: 'var(--ui-muted,#6b7280)' }, String(getX(d)))
    );
  });
  return h('svg', { width: '100%', height: '100%', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'bar chart' },
    h('line', { x1: pad, y1: H - pad, x2: W - pad, y2: H - pad, stroke: 'var(--ui-border,#e5e7eb)', strokeWidth: 1 }),
    bars
  );
}

export function AxisOptions() {}
`

/* ---- @tanstack/react-query stub (not used by fixtures) ------------------- */
const REACT_QUERY_STUB = /* js */ `
export function useQuery() { throw new Error('react-query is not enabled in this sandbox (no connect-src grant).'); }
export function QueryClient() {}
export function QueryClientProvider(props) { return props.children; }
`

// react-dom re-exports from the single bundled react.js so there is exactly
// one React instance (importing both 'react' and 'react-dom' hits the same
// module). Avoids esbuild's `__require("react")` trap for CJS externals.
const REACT_DOM_REEXPORT = `export { createRoot, hydrateRoot } from './react.js';`

/** Host-authored ESM runtime modules, keyed by served filename. */
export const RUNTIME_SHIMS: Record<string, string> = {
  'host-ui.js': HOST_UI_SOURCE,
  'ogui-bridge.js': OGUI_BRIDGE_MODULE_SOURCE,
  'react-dom.js': REACT_DOM_REEXPORT,
  'tanstack-react-table.js': REACT_TABLE_SHIM,
  'tanstack-react-charts.js': REACT_CHARTS_SHIM,
  'tanstack-react-query.js': REACT_QUERY_STUB,
}

/**
 * npm modules bundled from node_modules by esbuild, keyed by served filename.
 * `entry` is the stdin source; `external` keeps the shared React instance
 * out of the bundle so the import map resolves it to the single `react.js`.
 */
export const RUNTIME_NPM: Record<
  string,
  { entry: string; external: Array<string> }
> = {
  // One self-contained bundle holding the single React instance plus react-dom's
  // createRoot. Zero externals → no `__require` shim; React ships CJS so the API
  // is re-exported explicitly via destructuring (each becomes a static named
  // export the import map's consumers can bind).
  'react.js': {
    entry: `
import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
export default React;
export { createRoot, hydrateRoot };
export const {
  Children, Component, Fragment, Profiler, PureComponent, StrictMode, Suspense,
  cloneElement, createContext, createElement, createRef, forwardRef, isValidElement,
  lazy, memo, startTransition, useCallback, useContext, useDebugValue, useDeferredValue,
  useEffect, useId, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo,
  useReducer, useRef, useState, useSyncExternalStore, useTransition, version
} = React;
`,
    external: [],
  },
}
