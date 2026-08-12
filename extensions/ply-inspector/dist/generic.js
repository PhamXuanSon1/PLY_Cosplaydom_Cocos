"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.close = exports.update = exports.$ = exports.style = exports.template = void 0;
exports.template = `<div id="root" class="ply-inspector"></div>`;
exports.style = `
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
exports.$ = { root: '#root' };
// -----------------------------------------------------------------------------
//  Vòng đời
// -----------------------------------------------------------------------------
function update(dump) {
    const panel = this;
    panel.dump = dump;
    // Editor luôn đưa dump mới nhất -> lấy lại uuid thật, bỏ cache cũ.
    const freshUuid = dump.value && dump.value.uuid ? dump.value.uuid.value : null;
    if (freshUuid !== panel.__uuid)
        panel.__compIndex = undefined;
    panel.__uuid = freshUuid;
    const type = dump.type;
    // Đã dựng UI cho type này trong panel hiện tại -> chỉ cần refresh giá trị,
    // KHÔNG cache config theo type ở phạm vi module (từng gây bug: sửa
    // getInspectorConfig() trong code rồi mà inspector vẫn hiện bản cũ cho tới
    // khi restart Editor, vì cache đó không bao giờ hết hạn/khớp lại).
    if (panel.__structKey === type) {
        refreshAll(panel);
        return;
    }
    if (!panel.__fetching) {
        panel.__fetching = true;
        queryConfig(panel).then((cfg) => {
            panel.__fetching = false;
            if (panel.dump && panel.dump.type === type) {
                ensureStructure(panel, type, cfg);
                refreshAll(panel);
            }
        });
    }
}
exports.update = update;
function close() {
    this.__structKey = null;
}
exports.close = close;
// -----------------------------------------------------------------------------
//  Dựng cấu trúc (chỉ khi đổi component type)
// -----------------------------------------------------------------------------
function ensureStructure(panel, type, config) {
    if (panel.__structKey === type)
        return;
    panel.__structKey = type;
    const root = panel.$.root;
    root.innerHTML = '';
    panel.__props = {}; // tên prop -> ui-prop element
    panel.__tables = []; // trạng thái từng bảng
    if (config && (config.sections || config.buttons || config.tables)) {
        buildFromConfig(panel, root, config);
    }
    else {
        buildAllProps(panel, root);
    }
}
// Có config: dựng đúng theo khai báo.
function buildFromConfig(panel, root, config) {
    if (config.sections) {
        for (const sec of config.sections) {
            const section = document.createElement('ui-section');
            section.setAttribute('expand', '');
            section.setAttribute('header', sec.header);
            for (const propName of sec.props) {
                const prop = document.createElement('ui-prop');
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
            const btn = document.createElement('ui-button');
            if (def.color)
                btn.setAttribute('type', def.color);
            btn.textContent = def.label;
            btn.addEventListener('confirm', async () => {
                // Ghi nốt ô đang gõ dở / vừa tick trước khi gọi method, tránh mất thay đổi.
                await flushPending(panel);
                await callMethod(panel, def.method, def.args || []);
                // KHÔNG gọi Editor.Message.send('scene', 'refresh') ở đây:
                // nó reload lại scene -> component bị tạo lại -> uuid đang cache chết
                // ("Set property failed: ... does not exist") và mọi tick sau đó bị nuốt.
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
function buildAllProps(panel, root) {
    const value = panel.dump.value || {};
    for (const key of Object.keys(value)) {
        const info = value[key];
        if (!info || !info.visible)
            continue;
        const prop = document.createElement('ui-prop');
        prop.setAttribute('type', 'dump');
        panel.__props[key] = prop;
        root.appendChild(prop);
    }
}
// -----------------------------------------------------------------------------
//  Bảng
// -----------------------------------------------------------------------------
function buildTable(panel, def) {
    const section = document.createElement('ui-section');
    section.setAttribute('expand', '');
    section.setAttribute('header', def.header || def.arrayProp);
    const state = { def, keyword: '', rows: [], rowCount: -1, tbody: null, count: null };
    // Toolbar: search + count + add
    const tool = document.createElement('div');
    tool.className = 'ply-tool-row';
    if (def.search) {
        const search = document.createElement('ui-input');
        search.className = 'search';
        search.setAttribute('placeholder', '🔍 Tìm...');
        search.addEventListener('change', (e) => {
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
        const add = document.createElement('ui-button');
        add.textContent = '＋';
        add.addEventListener('confirm', async () => {
            await callMethod(panel, def.addMethod);
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
    if (def.removeMethod)
        thead.appendChild(document.createElement('span'));
    table.appendChild(thead);
    const tbody = document.createElement('div');
    tbody.className = 'ply-tbody';
    state.tbody = tbody;
    table.appendChild(tbody);
    section.appendChild(table);
    panel.__tables.push(state);
    return section;
}
function gridTemplate(def) {
    const cols = def.columns.map((c) => (c.type === 'checkbox' ? '40px' : '1fr'));
    if (def.removeMethod)
        cols.push('26px');
    return cols.join(' ');
}
function refreshTable(panel, state) {
    const def = state.def;
    const arr = panel.dump.value[def.arrayProp];
    const items = arr && Array.isArray(arr.value) ? arr.value : [];
    state.count.textContent = `${items.length} items`;
    if (state.rowCount !== items.length) {
        buildRows(panel, state, items.length);
        state.rowCount = items.length;
    }
    for (let i = 0; i < items.length; i++) {
        const row = state.rows[i];
        if (!row)
            continue;
        const v = items[i].value;
        for (const col of def.columns) {
            const el = row.cells[col.field];
            const raw = v[col.field] ? v[col.field].value : (col.type === 'checkbox' ? false : '');
            setIfNotFocused(el, col.type === 'checkbox' ? !!raw : (raw !== null && raw !== void 0 ? raw : ''));
        }
    }
    applyFilter(state);
}
function buildRows(panel, state, count) {
    const def = state.def;
    const tbody = state.tbody;
    tbody.innerHTML = '';
    state.rows = [];
    const grid = gridTemplate(def);
    for (let i = 0; i < count; i++) {
        const index = i;
        const row = document.createElement('div');
        row.className = 'ply-row';
        row.style.gridTemplateColumns = grid;
        const cells = {};
        for (const col of def.columns) {
            let el;
            if (col.type === 'checkbox') {
                el = document.createElement('ui-checkbox');
                el.addEventListener('confirm', (e) => {
                    track(panel, setProp(panel, `${def.arrayProp}.${index}.${col.field}`, 'Boolean', !!e.target.value));
                });
            }
            else {
                el = document.createElement('ui-input');
                el.addEventListener('confirm', (e) => {
                    track(panel, setProp(panel, `${def.arrayProp}.${index}.${col.field}`, 'String', e.target.value || ''));
                });
            }
            cells[col.field] = el;
            row.appendChild(el);
        }
        if (def.removeMethod) {
            const del = document.createElement('ui-button');
            del.className = 'del';
            del.setAttribute('type', 'danger');
            del.textContent = '✕';
            del.addEventListener('confirm', async () => {
                await callMethod(panel, def.removeMethod, [index]);
                await refresh(panel);
            });
            row.appendChild(del);
        }
        tbody.appendChild(row);
        state.rows.push({ root: row, cells });
    }
}
function applyFilter(state) {
    const def = state.def;
    const kw = state.keyword;
    const textCols = def.columns.filter((c) => c.type === 'text');
    for (const row of state.rows) {
        if (!kw) {
            row.root.classList.remove('hidden');
            continue;
        }
        let match = false;
        for (const col of textCols) {
            const el = row.cells[col.field];
            if (el && String(el.value || '').toLowerCase().includes(kw)) {
                match = true;
                break;
            }
        }
        row.root.classList.toggle('hidden', !match);
    }
}
// -----------------------------------------------------------------------------
//  Cập nhật giá trị (không dựng lại cấu trúc)
// -----------------------------------------------------------------------------
function refreshAll(panel) {
    const value = panel.dump.value || {};
    for (const name of Object.keys(panel.__props)) {
        if (value[name])
            panel.__props[name].render(value[name]);
    }
    for (const state of panel.__tables) {
        refreshTable(panel, state);
    }
}
// -----------------------------------------------------------------------------
//  Giao tiếp scene
// -----------------------------------------------------------------------------
function compUuid(panel) {
    return panel.__uuid || panel.dump.value.uuid.value;
}
// uuid của NODE chứa component.
function nodeUuid(panel) {
    const n = panel.dump && panel.dump.value && panel.dump.value.node;
    return (n && n.value && n.value.uuid) || null;
}
// QUAN TRỌNG: 'set-property' được giải quyết qua NodeManager (xem stack lỗi:
// NodeManager.setProperty <- GeneralSceneFacade.setNodeProperty). Nó tra uuid
// trong bảng NODE, nên truyền uuid COMPONENT sẽ luôn báo
// "Set property failed: <uuid> does not exist" và cú ghi bị nuốt mất.
// Cách đúng: uuid = uuid của node, path = "__comps__.<index>.<path gốc>".
async function compIndex(panel) {
    if (typeof panel.__compIndex === 'number')
        return panel.__compIndex;
    const nUuid = nodeUuid(panel);
    if (!nUuid)
        return -1;
    try {
        const node = await Editor.Message.request('scene', 'query-node', nUuid);
        const comps = (node && node.__comps__) || [];
        const target = compUuid(panel);
        for (let i = 0; i < comps.length; i++) {
            const c = comps[i];
            const uuid = c && c.value && c.value.uuid && c.value.uuid.value;
            if (uuid === target) {
                panel.__compIndex = i;
                return i;
            }
        }
        // Không khớp uuid (scene vừa reload) -> khớp theo type.
        for (let i = 0; i < comps.length; i++) {
            if (comps[i] && comps[i].type === panel.dump.type) {
                panel.__compIndex = i;
                return i;
            }
        }
    }
    catch (_e) {
        // trả -1 -> setProp sẽ thử fallback rồi báo lỗi rõ ràng
    }
    return -1;
}
// Gom các lệnh ghi đang bay, để nút bấm chờ ghi xong mới gọi method.
function track(panel, p) {
    if (!panel.__pending)
        panel.__pending = [];
    panel.__pending.push(p);
    p.catch(() => { }).then(() => {
        const i = panel.__pending.indexOf(p);
        if (i !== -1)
            panel.__pending.splice(i, 1);
    });
}
async function flushPending(panel) {
    if (panel.__pending && panel.__pending.length) {
        await Promise.all(panel.__pending.map((p) => p.catch(() => { })));
    }
}
async function queryConfig(panel) {
    try {
        const cfg = await Editor.Message.request('scene', 'execute-component-method', {
            uuid: compUuid(panel),
            name: 'getInspectorConfig',
            args: [],
        });
        return cfg && typeof cfg === 'object' ? cfg : null;
    }
    catch (_e) {
        return null; // component không có getInspectorConfig -> fallback
    }
}
async function callMethod(panel, name, args = []) {
    try {
        await Editor.Message.request('scene', 'execute-component-method', {
            uuid: compUuid(panel), name, args,
        });
    }
    catch (err) {
        console.error(`[ply-inspector] Lỗi gọi method "${name}":`, err);
    }
}
async function setProp(panel, path, type, value) {
    // Cách chuẩn: uuid NODE + path có tiền tố __comps__.<index>
    const nUuid = nodeUuid(panel);
    const idx = await compIndex(panel);
    if (nUuid && idx >= 0) {
        try {
            await Editor.Message.request('scene', 'set-property', {
                uuid: nUuid,
                path: `__comps__.${idx}.${path}`,
                dump: { type, value },
            });
            return;
        }
        catch (err) {
            panel.__compIndex = undefined; // buộc dò lại index ở lần sau
            console.error(`[ply-inspector] set-property "${path}" lỗi (dạng node):`, err);
        }
    }
    // Dự phòng: vài bản editor chấp nhận thẳng uuid component.
    try {
        await Editor.Message.request('scene', 'set-property', {
            uuid: compUuid(panel), path, dump: { type, value },
        });
        return;
    }
    catch (err) {
        console.error(`[ply-inspector] set-property "${path}" lỗi (dạng component):`, err);
    }
    // Ghi KHÔNG thành công: cảnh báo rõ thay vì im lặng để UI hiện sai trạng thái.
    console.warn(`[ply-inspector] Thay đổi "${path}" CHƯA được ghi vào component.`);
}
async function refresh(panel) {
    try {
        const d = await Editor.Message.request('scene', 'query-component', compUuid(panel));
        if (d) {
            panel.dump = d;
            refreshAll(panel);
        }
    }
    catch (err) {
        console.error('[ply-inspector] Lỗi refresh:', err);
    }
}
function setIfNotFocused(el, value) {
    if (!el)
        return;
    if (document.activeElement === el || (el.contains && el.contains(document.activeElement)))
        return;
    if (el.value !== value)
        el.value = value;
}
