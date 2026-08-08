"use strict";
// =============================================================================
//  Custom Inspector cho component "CharacterManager"
//  - Cocos Creator 3.7.4
//  - Vẽ UI bằng UI-Kit của editor (ui-section / ui-prop / ui-button / ...)
//  - Tái tạo giao diện Odin Inspector bên Unity: hàng nút màu + bảng trang bị
//
//  Cơ chế:
//   * update(dump): editor đưa dữ liệu component đã serialize -> ta vẽ lại UI.
//   * ui-prop.render(subDump): vẽ field mặc định (Node/Asset/array) + tự sync.
//   * set-property: sửa 1 ô trong bảng (checkbox/slot/attachment).
//   * execute-component-method: bấm nút -> gọi thẳng hàm trong CharacterManager.
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.close = exports.update = exports.ready = exports.$ = exports.style = exports.template = void 0;
// -----------------------------------------------------------------------------
//  Template (HTML) — dùng các web-component của UI-Kit
// -----------------------------------------------------------------------------
exports.template = `
<div class="ply-inspector">

  <ui-section header="1. Nhân vật & Setup" expand class="config">
    <ui-prop id="characterSetups" type="dump"></ui-prop>
    <ui-prop id="character1" type="dump"></ui-prop>
  </ui-section>

  <ui-section header="2. Target Test" expand class="config">
    <ui-prop id="targetTestCharacter" type="dump"></ui-prop>
    <ui-prop id="testEquipmentDataAsset" type="dump"></ui-prop>
  </ui-section>

  <ui-section header="3. Hành động (Editor)" expand class="config">
    <div class="btn-grid">
      <ui-button id="btnGetAll"  type="success">Lấy Tất Cả Slot</ui-button>
      <ui-button id="btnLoad"    type="primary">Tải Từ JSON</ui-button>
      <ui-button id="btnSave"    type="warn">Lưu Vào JSON</ui-button>
      <ui-button id="btnEquip"   type="success">Mặc Đồ Ngay</ui-button>
      <ui-button id="btnDisable" type="danger">Tắt Tất Cả Đồ</ui-button>
    </div>
  </ui-section>

  <ui-section header="4. Bộ Trang Bị" expand class="config">
    <div class="tool-row">
      <ui-input id="search" placeholder="🔍 Tìm slot / attachment..."></ui-input>
      <span id="count" class="count">0 items</span>
      <ui-button id="btnAdd" class="add">＋</ui-button>
    </div>

    <div class="table">
      <div class="thead">
        <span class="c-en">Bật</span>
        <span class="c-slot">Slot Name</span>
        <span class="c-att">Attachment Name</span>
        <span class="c-del"></span>
      </div>
      <div id="tbody" class="tbody"></div>
    </div>
  </ui-section>

</div>
`;
// -----------------------------------------------------------------------------
//  Style (CSS)
// -----------------------------------------------------------------------------
exports.style = `
.ply-inspector { padding: 4px 2px; }
.ply-inspector ui-section.config { margin-bottom: 6px; }

.btn-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px 2px;
}
.btn-grid ui-button { width: 100%; }

.tool-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 2px 6px;
}
.tool-row #search { flex: 1; }
.tool-row .count { font-size: 11px; opacity: .7; white-space: nowrap; }
.tool-row .add { min-width: 26px; }

.table { border: 1px solid var(--color-normal-border, #2a2a2a); border-radius: 3px; }
.thead, .row {
  display: grid;
  grid-template-columns: 40px 1fr 1fr 26px;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
}
.thead {
  font-size: 11px;
  font-weight: bold;
  opacity: .75;
  border-bottom: 1px solid var(--color-normal-border, #2a2a2a);
  padding-top: 4px;
  padding-bottom: 4px;
}
.tbody { max-height: 320px; overflow-y: auto; }
.row:nth-child(odd) { background: rgba(255,255,255,.03); }
.row .del { min-width: 22px; opacity: .7; }
.row .del:hover { opacity: 1; }
.row.hidden { display: none; }
`;
// -----------------------------------------------------------------------------
//  Map selector -> element (editor tự gán vào this.$)
// -----------------------------------------------------------------------------
exports.$ = {
    characterSetups: '#characterSetups',
    character1: '#character1',
    targetTestCharacter: '#targetTestCharacter',
    testEquipmentDataAsset: '#testEquipmentDataAsset',
    btnGetAll: '#btnGetAll',
    btnLoad: '#btnLoad',
    btnSave: '#btnSave',
    btnEquip: '#btnEquip',
    btnDisable: '#btnDisable',
    btnAdd: '#btnAdd',
    search: '#search',
    count: '#count',
    tbody: '#tbody',
};
// -----------------------------------------------------------------------------
//  Vòng đời
// -----------------------------------------------------------------------------
// Gắn sự kiện 1 lần khi panel được tạo.
function ready() {
    const panel = this;
    panel.__rowCount = -1; // ép build lần đầu
    panel.__rows = []; // cache element từng dòng
    // --- Các nút hành động: gọi thẳng method của CharacterManager ---
    bindButton(panel, panel.$.btnGetAll, 'getAllSlots');
    bindButton(panel, panel.$.btnLoad, 'loadFromTestJson');
    bindButton(panel, panel.$.btnSave, 'saveToTestJson');
    bindButton(panel, panel.$.btnEquip, 'onEditorEquip');
    bindButton(panel, panel.$.btnDisable, 'disableAllItems');
    // --- Nút thêm dòng ---
    panel.$.btnAdd.addEventListener('confirm', async () => {
        await callMethod(panel, 'addEquipmentPair');
        await refresh(panel);
    });
    // --- Ô search: đẩy vào property searchKeyword để tái dùng filter có sẵn ---
    panel.$.search.addEventListener('confirm', async (e) => {
        await setProp(panel, 'searchKeyword', 'String', e.target.value || '');
        await refresh(panel);
    });
}
exports.ready = ready;
// Editor gọi mỗi khi dữ liệu component thay đổi.
function update(dump) {
    doUpdate(this, dump);
}
exports.update = update;
function close() {
    this.__rows = [];
}
exports.close = close;
// -----------------------------------------------------------------------------
//  Logic vẽ
// -----------------------------------------------------------------------------
function doUpdate(panel, dump) {
    panel.dump = dump;
    // Vẽ các field mặc định (tự sync ngược scene).
    renderProp(panel.$.characterSetups, dump.value.characterSetups);
    renderProp(panel.$.character1, dump.value.character1);
    renderProp(panel.$.targetTestCharacter, dump.value.targetTestCharacter);
    renderProp(panel.$.testEquipmentDataAsset, dump.value.testEquipmentDataAsset);
    renderTable(panel);
}
function renderProp(el, subDump) {
    if (el && subDump)
        el.render(subDump);
}
function renderTable(panel) {
    var _a, _b, _c, _d;
    const arr = (_b = (_a = panel.dump) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b.myEquipmentSet;
    const items = arr && Array.isArray(arr.value) ? arr.value : [];
    panel.$.count.textContent = `${items.length} items`;
    // Chỉ build lại DOM khi số dòng đổi -> giữ được focus khi đang gõ.
    if (panel.__rowCount !== items.length) {
        buildRows(panel, items.length);
        panel.__rowCount = items.length;
    }
    // Cập nhật giá trị từng dòng.
    for (let i = 0; i < items.length; i++) {
        const row = panel.__rows[i];
        if (!row)
            continue;
        const v = items[i].value;
        setIfNotFocused(row.chk, 'value', !!v.isEnabled.value);
        setIfNotFocused(row.slot, 'value', (_c = v.slotName.value) !== null && _c !== void 0 ? _c : '');
        setIfNotFocused(row.att, 'value', (_d = v.attachmentName.value) !== null && _d !== void 0 ? _d : '');
    }
}
// Dựng lại toàn bộ các dòng của bảng.
function buildRows(panel, count) {
    const tbody = panel.$.tbody;
    tbody.innerHTML = '';
    panel.__rows = [];
    for (let i = 0; i < count; i++) {
        const index = i; // cố định index cho listener
        const row = document.createElement('div');
        row.className = 'row';
        const chk = document.createElement('ui-checkbox');
        chk.className = 'c-en';
        chk.addEventListener('confirm', (e) => {
            setProp(panel, `myEquipmentSet.${index}.isEnabled`, 'Boolean', !!e.target.value);
        });
        const slot = document.createElement('ui-input');
        slot.className = 'c-slot';
        slot.addEventListener('confirm', (e) => {
            setProp(panel, `myEquipmentSet.${index}.slotName`, 'String', e.target.value || '');
        });
        const att = document.createElement('ui-input');
        att.className = 'c-att';
        att.addEventListener('confirm', (e) => {
            setProp(panel, `myEquipmentSet.${index}.attachmentName`, 'String', e.target.value || '');
        });
        const del = document.createElement('ui-button');
        del.className = 'del';
        del.setAttribute('type', 'danger');
        del.textContent = '✕';
        del.addEventListener('confirm', async () => {
            await callMethod(panel, 'removeEquipmentPair', [index]);
            await refresh(panel);
        });
        row.appendChild(chk);
        row.appendChild(slot);
        row.appendChild(att);
        row.appendChild(del);
        tbody.appendChild(row);
        panel.__rows.push({ root: row, chk, slot, att });
    }
}
// -----------------------------------------------------------------------------
//  Helpers giao tiếp với scene
// -----------------------------------------------------------------------------
// Bấm nút -> gọi method không tham số.
function bindButton(panel, btn, methodName) {
    if (!btn)
        return;
    btn.addEventListener('confirm', async () => {
        await callMethod(panel, methodName);
        await refresh(panel);
    });
}
// Gọi 1 method của component đang chọn.
async function callMethod(panel, name, args = []) {
    try {
        await Editor.Message.request('scene', 'execute-component-method', {
            uuid: panel.dump.value.uuid.value,
            name,
            args,
        });
    }
    catch (err) {
        console.error(`[character-inspector] Lỗi gọi method "${name}":`, err);
    }
}
// Sửa 1 property (scalar) và ghi vào scene (có undo).
async function setProp(panel, path, type, value) {
    try {
        await Editor.Message.request('scene', 'set-property', {
            uuid: panel.dump.value.uuid.value,
            path,
            dump: { type, value },
        });
    }
    catch (err) {
        console.error(`[character-inspector] Lỗi set-property "${path}":`, err);
    }
}
// Query lại dump component rồi vẽ lại (dùng sau khi gọi method vì method
// không tự trigger update của inspector).
async function refresh(panel) {
    try {
        const uuid = panel.dump.value.uuid.value;
        const newDump = await Editor.Message.request('scene', 'query-component', uuid);
        if (newDump)
            doUpdate(panel, newDump);
    }
    catch (err) {
        console.error('[character-inspector] Lỗi refresh:', err);
    }
}
// Không ghi đè giá trị nếu người dùng đang focus (đang gõ) vào ô đó.
function setIfNotFocused(el, key, value) {
    var _a;
    if (!el)
        return;
    if (document.activeElement === el || ((_a = el.contains) === null || _a === void 0 ? void 0 : _a.call(el, document.activeElement)))
        return;
    if (el[key] !== value)
        el[key] = value;
}
