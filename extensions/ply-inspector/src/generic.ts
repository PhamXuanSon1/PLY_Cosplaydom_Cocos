// =============================================================================
//  GENERIC INSPECTOR (config-driven) — ply-inspector
//  -------------------------------------------------------------------------
//  Một inspector DUY NHẤT dùng cho MỌI component. Extension không hard-code
//  component nào cả: mỗi component tự khai báo UI của nó bằng cách implement
//  method:
//
//      public getInspectorConfig(): InspectorConfig { ... }
//
//  Inspector gọi method đó qua execute-component-method để lấy config rồi vẽ:
//    - sections : nhóm các property (render bằng ui-prop type="dump", tự sync)
//    - buttons  : hàng nút màu, bấm -> gọi method của component
//    - tables   : bảng nhiều cột (checkbox/text) cho mảng dữ liệu đơn giản
//
//  Nếu component KHÔNG có getInspectorConfig -> fallback render tất cả property
//  (an toàn, không mất gì).
//
//  Thêm 1 component vào hệ thống = implement getInspectorConfig() trong component
//  đó + thêm 1 dòng map "<TenComponent>": "./dist/generic.js" ở package.json.
// =============================================================================

declare const Editor: any;

interface ColumnDef { field: string; label: string; type: 'checkbox' | 'text'; }
interface TableDef {
  header?: string;
  arrayProp: string;
  search?: boolean;
  columns: ColumnDef[];
  addMethod?: string;
  removeMethod?: string;
}
interface ButtonDef { label: string; method: string; color?: string; args?: any[]; }
interface SectionDef { header: string; props: string[]; }
interface InspectorConfig {
  sections?: SectionDef[];
  buttons?: ButtonDef[];
  buttonsHeader?: string;
  tables?: TableDef[];
}

// Cache config theo tên component type (config là tĩnh theo type).
const CONFIG_CACHE: Record<string, InspectorConfig | null> = {};

export const template = /* html */ `<div id="root" class="ply-inspector"></div>`;

export const style = /* css */ `
.ply-inspector { padding: 4px 2px; }
.ply-inspector ui-section { margin-bottom: 6px; }
.ply-btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px 2px; }
.ply-btn-grid ui-button { width: 100%; }
.ply-tool-row { display: flex; align-items: center; gap: 6px; padding: 4px 2px 6px; }
.ply-tool-row .search { flex: 1; }
.ply-tool-row .count { font-size: 11px; opacity: .7; white-space: nowrap; }
.ply-table { border: 1px solid var(--color-normal-border, #2a2a2a); border-radius: 3px; }
.ply-thead, .ply-row { display: grid; align-items: center; gap: 4px; padding: 2px 4px; }
.ply-thead { font-size: 11px; font-weight: bold; opacity: .75; border-bottom: 1px solid var(--color-normal-border, #2a2a2a); padding: 4px; }
.ply-tbody { max-height: 320px; overflow-y: auto; }
.ply-row:nth-child(odd) { background: rgba(255,255,255,.03); }
.ply-row .del { min-width: 22px; opacity: .7; }
.ply-row.hidden { display: none; }
`;

export const $ = { root: '#root' };

// -----------------------------------------------------------------------------
//  Vòng đời
// -----------------------------------------------------------------------------
export function update(this: any, dump: any) {
  const panel = this;
  panel.dump = dump;
  const type = dump.type;

  if (Object.prototype.hasOwnProperty.call(CONFIG_CACHE, type)) {
    ensureStructure(panel, type, CONFIG_CACHE[type]);
    refreshAll(panel);
  } else if (!panel.__fetching) {
    panel.__fetching = true;
    queryConfig(panel).then((cfg) => {
      CONFIG_CACHE[type] = cfg;
      panel.__fetching = false;
      if (panel.dump && panel.dump.type === type) {
        ensureStructure(panel, type, cfg);
        refreshAll(panel);
      }
    });
  }
}

export function close(this: any) {
  this.__structKey = null;
}

// -----------------------------------------------------------------------------
//  Dựng cấu trúc (chỉ khi đổi component type)
// -----------------------------------------------------------------------------
function ensureStructure(panel: any, type: string, config: InspectorConfig | null) {
  if (panel.__structKey === type) return;
  panel.__structKey = type;

  const root: HTMLElement = panel.$.root;
  root.innerHTML = '';
  panel.__props = {};   // tên prop -> ui-prop element
  panel.__tables = [];  // trạng thái từng bảng

  if (config && (config.sections || config.buttons || config.tables)) {
    buildFromConfig(panel, root, config);
  } else {
    buildAllProps(panel, root);
  }
}

// Có config: dựng đúng theo khai báo.
function buildFromConfig(panel: any, root: HTMLElement, config: InspectorConfig) {
  if (config.sections) {
    for (const sec of config.sections) {
      const section = document.createElement('ui-section');
      section.setAttribute('expand', '');
      section.setAttribute('header', sec.header);
      for (const propName of sec.props) {
        const prop = document.createElement('ui-prop') as any;
        prop.setAttribute('type', 'dump');
        panel.__props[propName] = prop;
        section.appendChild(prop);
      }
      root.appendChild(section);
    }
  }

  if (config.buttons && config.buttons.length) {
    const section = document.createElement('ui-section');
    section.setAttribute('expand', '');
    section.setAttribute('header', config.buttonsHeader || 'Hành động (Editor)');
    const grid = document.createElement('div');
    grid.className = 'ply-btn-grid';
    for (const def of config.buttons) {
      const btn = document.createElement('ui-button') as any;
      if (def.color) btn.setAttribute('type', def.color);
      btn.textContent = def.label;
      btn.addEventListener('confirm', async () => {
        await callMethod(panel, def.method, def.args || []);
        await refresh(panel);
      });
      grid.appendChild(btn);
    }
    section.appendChild(grid);
    root.appendChild(section);
  }

  if (config.tables) {
    for (const def of config.tables) {
      root.appendChild(buildTable(panel, def));
    }
  }
}

// Không có config: render toàn bộ property (giống inspector mặc định).
function buildAllProps(panel: any, root: HTMLElement) {
  const value = panel.dump.value || {};
  for (const key of Object.keys(value)) {
    const info = value[key];
    if (!info || !info.visible) continue;
    const prop = document.createElement('ui-prop') as any;
    prop.setAttribute('type', 'dump');
    panel.__props[key] = prop;
    root.appendChild(prop);
  }
}

// -----------------------------------------------------------------------------
//  Bảng
// -----------------------------------------------------------------------------
function buildTable(panel: any, def: TableDef): HTMLElement {
  const section = document.createElement('ui-section');
  section.setAttribute('expand', '');
  section.setAttribute('header', def.header || def.arrayProp);

  const state: any = { def, keyword: '', rows: [], rowCount: -1, tbody: null, count: null };

  // Toolbar: search + count + add
  const tool = document.createElement('div');
  tool.className = 'ply-tool-row';

  if (def.search) {
    const search = document.createElement('ui-input') as any;
    search.className = 'search';
    search.setAttribute('placeholder', '🔍 Tìm...');
    search.addEventListener('change', (e: any) => {
      state.keyword = (e.target.value || '').toLowerCase();
      applyFilter(state);
    });
    tool.appendChild(search);
  }

  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = '0 items';
  state.count = count;
  tool.appendChild(count);

  if (def.addMethod) {
    const add = document.createElement('ui-button') as any;
    add.textContent = '＋';
    add.addEventListener('confirm', async () => {
      await callMethod(panel, def.addMethod!);
      await refresh(panel);
    });
    tool.appendChild(add);
  }
  section.appendChild(tool);

  // Header + body
  const table = document.createElement('div');
  table.className = 'ply-table';
  const grid = gridTemplate(def);

  const thead = document.createElement('div');
  thead.className = 'ply-thead';
  thead.style.gridTemplateColumns = grid;
  for (const col of def.columns) {
    const c = document.createElement('span');
    c.textContent = col.label;
    thead.appendChild(c);
  }
  if (def.removeMethod) thead.appendChild(document.createElement('span'));
  table.appendChild(thead);

  const tbody = document.createElement('div');
  tbody.className = 'ply-tbody';
  state.tbody = tbody;
  table.appendChild(tbody);

  section.appendChild(table);
  panel.__tables.push(state);
  return section;
}

function gridTemplate(def: TableDef): string {
  const cols: string[] = def.columns.map((c) => (c.type === 'checkbox' ? '40px' : '1fr'));
  if (def.removeMethod) cols.push('26px');
  return cols.join(' ');
}

function refreshTable(panel: any, state: any) {
  const def: TableDef = state.def;
  const arr = panel.dump.value[def.arrayProp];
  const items: any[] = arr && Array.isArray(arr.value) ? arr.value : [];
  state.count.textContent = `${items.length} items`;

  if (state.rowCount !== items.length) {
    buildRows(panel, state, items.length);
    state.rowCount = items.length;
  }

  for (let i = 0; i < items.length; i++) {
    const row = state.rows[i];
    if (!row) continue;
    const v = items[i].value;
    for (const col of def.columns) {
      const el = row.cells[col.field];
      const raw = v[col.field] ? v[col.field].value : (col.type === 'checkbox' ? false : '');
      setIfNotFocused(el, col.type === 'checkbox' ? !!raw : (raw ?? ''));
    }
  }
  applyFilter(state);
}

function buildRows(panel: any, state: any, count: number) {
  const def: TableDef = state.def;
  const tbody: HTMLElement = state.tbody;
  tbody.innerHTML = '';
  state.rows = [];
  const grid = gridTemplate(def);

  for (let i = 0; i < count; i++) {
    const index = i;
    const row = document.createElement('div');
    row.className = 'ply-row';
    row.style.gridTemplateColumns = grid;

    const cells: any = {};
    for (const col of def.columns) {
      let el: any;
      if (col.type === 'checkbox') {
        el = document.createElement('ui-checkbox');
        el.addEventListener('confirm', (e: any) => {
          setProp(panel, `${def.arrayProp}.${index}.${col.field}`, 'Boolean', !!e.target.value);
        });
      } else {
        el = document.createElement('ui-input');
        el.addEventListener('confirm', (e: any) => {
          setProp(panel, `${def.arrayProp}.${index}.${col.field}`, 'String', e.target.value || '');
        });
      }
      cells[col.field] = el;
      row.appendChild(el);
    }

    if (def.removeMethod) {
      const del = document.createElement('ui-button') as any;
      del.className = 'del';
      del.setAttribute('type', 'danger');
      del.textContent = '✕';
      del.addEventListener('confirm', async () => {
        await callMethod(panel, def.removeMethod!, [index]);
        await refresh(panel);
      });
      row.appendChild(del);
    }

    tbody.appendChild(row);
    state.rows.push({ root: row, cells });
  }
}

function applyFilter(state: any) {
  const def: TableDef = state.def;
  const kw: string = state.keyword;
  const textCols = def.columns.filter((c: ColumnDef) => c.type === 'text');
  for (const row of state.rows) {
    if (!kw) { row.root.classList.remove('hidden'); continue; }
    let match = false;
    for (const col of textCols) {
      const el = row.cells[col.field];
      if (el && String(el.value || '').toLowerCase().includes(kw)) { match = true; break; }
    }
    row.root.classList.toggle('hidden', !match);
  }
}

// -----------------------------------------------------------------------------
//  Cập nhật giá trị (không dựng lại cấu trúc)
// -----------------------------------------------------------------------------
function refreshAll(panel: any) {
  const value = panel.dump.value || {};
  for (const name of Object.keys(panel.__props)) {
    if (value[name]) panel.__props[name].render(value[name]);
  }
  for (const state of panel.__tables) {
    refreshTable(panel, state);
  }
}

// -----------------------------------------------------------------------------
//  Giao tiếp scene
// -----------------------------------------------------------------------------
function compUuid(panel: any): string {
  return panel.dump.value.uuid.value;
}

async function queryConfig(panel: any): Promise<InspectorConfig | null> {
  try {
    const cfg = await Editor.Message.request('scene', 'execute-component-method', {
      uuid: compUuid(panel),
      name: 'getInspectorConfig',
      args: [],
    });
    return cfg && typeof cfg === 'object' ? cfg : null;
  } catch (_e) {
    return null; // component không có getInspectorConfig -> fallback
  }
}

async function callMethod(panel: any, name: string, args: any[] = []) {
  try {
    await Editor.Message.request('scene', 'execute-component-method', {
      uuid: compUuid(panel), name, args,
    });
  } catch (err) {
    console.error(`[ply-inspector] Lỗi gọi method "${name}":`, err);
  }
}

async function setProp(panel: any, path: string, type: string, value: any) {
  try {
    await Editor.Message.request('scene', 'set-property', {
      uuid: compUuid(panel), path, dump: { type, value },
    });
  } catch (err) {
    console.error(`[ply-inspector] Lỗi set-property "${path}":`, err);
  }
}

async function refresh(panel: any) {
  try {
    const d = await Editor.Message.request('scene', 'query-component', compUuid(panel));
    if (d) { panel.dump = d; refreshAll(panel); }
  } catch (err) {
    console.error('[ply-inspector] Lỗi refresh:', err);
  }
}

function setIfNotFocused(el: any, value: any) {
  if (!el) return;
  if (document.activeElement === el || (el.contains && el.contains(document.activeElement))) return;
  if (el.value !== value) el.value = value;
}
