# Hướng Dẫn Setup Hệ Thống DrawItem (Kéo – Vẽ – Makeup)

Tài liệu này hướng dẫn cách setup gameplay "cầm đồ vật → kéo → vẽ/gắn lên nhân vật" của game.
Engine: **Cocos Creator 3.7.4**. Hệ toạ độ dùng là **UI 2D + Physics 2D (Collider2D)**.

---

## 1. Tổng quan luồng chơi

```
Người chơi chạm/click 1 đồ vật (DrawItem)
        │
        ▼
DrawInputManager bắn raycast 2D (testPoint) tại điểm chạm
        │
        ▼
Tìm thấy DrawItemController → cầm item lên (đổi parent lên Canvas, phóng to, xoay)
        │
        ▼
Kéo item đi (mouseDrag) → tuỳ ItemType:
   • DirectDraw / DipAndDraw → raycast tìm MakeupTarget → applyMakeup() tăng alpha slot Spine
   • SnapToTarget           → kiểm tra khoảng cách tới snapTarget
   • DragAwayToFade         → kéo ra xa rồi mờ dần
        │
        ▼
Thả tay (mouseUp) → hoàn thành hoặc bay về chỗ cũ (SpawnPos)
```

Toàn bộ input **tập trung ở 1 chỗ duy nhất là `DrawInputManager`** (không gắn script input lên từng item). Nó lắng nghe `input.on(TOUCH_*)` toàn màn hình rồi tự raycast để biết chạm trúng cái gì.

---

## 2. Các script trong hệ thống

| Script | Gắn ở đâu | Vai trò |
|---|---|---|
| `DrawInputManager` | 1 Node quản lý duy nhất trong scene | Bộ não: nhận input, raycast, điều phối cầm/kéo/thả |
| `DrawItemController` | Trên mỗi đồ vật kéo được | Cấu hình loại item, ID, âm thanh, sự kiện, sprite đóng/mở |
| `DrawItemMovement` | Cùng node với Controller | Lưu vị trí/parent gốc để bay về sau khi thả |
| `DrawItemGraphic` | Cùng node với Controller | Góc xoay khi cầm + phóng to khi kéo (scale on drag) |
| `MakeupTarget` | Trên các vùng cần vẽ (mặt, tóc...) | Nhận cọ quẹt, tăng alpha attachment Spine dần dần |
| `DipTarget` | Trên hộp phấn/màu (loại DipAndDraw) | Cờ `isOpen` – cọ phải nhúng vào đây trước khi vẽ |

> ⚠️ **Bắt buộc cùng node:** `DrawItemController`, `DrawItemMovement`, `DrawItemGraphic` nên nằm **cùng 1 node** với `BoxCollider2D`. Manager tìm chúng bằng `getComponent` (ưu tiên chính node), fallback mới xuống node con.

---

## 3. Chuẩn bị Scene (làm 1 lần)

### 3.1. Bật Physics 2D
Hệ thống raycast bằng `PhysicsSystem2D.instance.testPoint()`, nên **phải bật Physics 2D**:
- `Project → Project Settings → Feature Cropping` → bật **Physics 2D** (built-in hoặc box2d).
- Mỗi đồ vật kéo được và mỗi MakeupTarget đều cần 1 **Collider2D** (thường là `BoxCollider2D` hoặc `PolygonCollider2D`).

### 3.2. Layer
`DrawInputManager` lọc theo Layer để tránh raycast nhầm. Vào `Project → Project Settings → Layers` tạo (nếu chưa có):
- 1 Layer cho đồ vật, ví dụ **DrawItem** → dùng cho `Draw Item Layer Mask`.
- 1 Layer cho vùng makeup, ví dụ **MakeupTarget** → dùng cho `Makeup Target Layer`.

> Trong code hiện tại việc lọc chủ yếu dựa vào **loại Component** (`testPoint` trả về collider rồi lọc `getComponent(DrawItemController)`), nên Layer Mask mang tính phòng ngừa. Vẫn nên set cho đúng để dễ mở rộng.

### 3.3. Camera
`DrawInputManager` cần 1 `Camera` (field **Main Camera**). Nếu để trống, `start()` sẽ tự lấy Camera trên node hoặc node con.

---

## 4. Setup `DrawInputManager`

Tạo 1 Node rỗng (vd `DrawInputManager`) trong scene, add component `DrawInputManager`, rồi điền Inspector:

### Nhóm 1 – Layer Masks & Raycast
| Field | Ý nghĩa |
|---|---|
| **Draw Item Layer Mask** | Layer chứa đồ vật kéo được |
| **Makeup Target Layer** | Layer chứa MakeupTarget |
| **Max Distance** | Giữ mặc định 100 |

### Nhóm 2 – Effects & UI
| Field | Ý nghĩa |
|---|---|
| **Drag Trail Effect** | (Tuỳ chọn) Node Trail/Particle bay theo con trỏ khi cầm |
| **Drag Layer Container** | Node trên cùng Canvas để chứa item khi kéo (item luôn vẽ đè). **Để trống** thì tự dùng Node tên `Canvas` |
| **Progress Container** | (Tuỳ chọn) Container vòng progress hiện khi cầm cọ |
| **Progress Fill Image (Sprite)** | Sprite kiểu **Filled** để chạy fill % |

### Nhóm 3 – Intro Settings
| Field | Ý nghĩa |
|---|---|
| **Is Click First** | Để `false`. Lần chạm đầu tiên sẽ phát BGM + intro |
| **Intro Animator / Node** | (Tuỳ chọn) Node có `Animation` chứa clip `PlayIntro` |

### Nhóm 4 – Fake Store Settings
| Field | Ý nghĩa |
|---|---|
| **Is Go To Store On Click Enabled** | Bật thì mọi click sẽ mở Store (dùng ở cuối playable) |

### Main Camera
Gán Camera chính của scene.

---

## 5. Setup 1 đồ vật kéo được (DrawItem)

### 5.1. Component tối thiểu trên node đồ vật
1. `UITransform` (mặc định của Node UI)
2. `Sprite` (hình đồ vật) — thường đặt ở node con để tách "sprite đóng" / "sprite mở"
3. **`BoxCollider2D`** (hoặc Polygon) — vùng bấm trúng
4. `DrawItemController`
5. `DrawItemMovement`
6. `DrawItemGraphic`

### 5.2. `DrawItemController` – các trường quan trọng

**Nhóm 1 – Basic Info**
- **Item Type**: chọn 1 trong 5 loại (xem mục 5.3)
- **Unlock Requirements**: danh sách item khác phải hoàn thành trước (khoá điều kiện)
- **Makeup ID**: chuỗi ID. **Phải khớp với `Required Makeup ID` của MakeupTarget** thì mới vẽ được.
- **Tip Radius**: bán kính quét đầu cọ

**Nhóm 2 – Interaction Setup**
- **Tip Point**: Node rỗng đặt ở đầu cọ (điểm phát raycast khi vẽ)
- **Dip Target**: Node hộp phấn (chỉ dùng cho `DipAndDraw`)
- **Snap Target**: Node đích (chỉ dùng cho `SnapToTarget`)
- **Snap Radius**: bán kính hút vào đích (khoảng cách thực tế nhân ~50px)

**Nhóm 3 – Visual & Bones**
- **Closed Sprite**: Node hiển thị khi **chưa cầm** (đóng)
- **Open Sprite**: Node hiển thị khi **đang cầm** (mở)
- **Open/Close Bones On Grab**: tên bone Spine cần mở/đóng khi cầm (vd mở miệng)
- **Draw Effect**: Particle bật khi quẹt trúng vùng hợp lệ

**Nhóm 4 – Audio & Events**
- **Play Loop FX On Drag** / **Loop FX Type**: âm thanh loop khi kéo
- **Play One-Shot When Drawing**: BẬT = kêu 1 tiếng mỗi lần tăng tiến độ (cọ, phấn); TẮT = loop liên tục (máy sấy)
- **Play FX On Complete** / **Complete FX Type**: âm khi hoàn thành
- **OnGrab / OnDrop / OnTipPointHit / OnComplete Event**: EventHandler gọi hàm ngoài

**Nhóm 5 – Completion**
- **Enable Auto Complete** + **Auto Complete Threshold**: tự hoàn thành hết target khi đạt % (chỉ DirectDraw/DipAndDraw)

### 5.3. Cấu hình theo từng Item Type

| Item Type | Ý nghĩa | Cần set thêm |
|---|---|---|
| **ClickOnly (0)** | Chỉ cần click 1 phát là xong | — |
| **DirectDraw (1)** | Cầm lên vẽ trực tiếp lên mặt | `Tip Point`, `Makeup ID` khớp Target |
| **DipAndDraw (2)** | Phải chấm vào phấn trước rồi mới vẽ | thêm `Dip Target` + node đó có `DipTarget.isOpen = true` |
| **SnapToTarget (3)** | Kéo thả vào 1 vị trí cố định (vd đội tóc giả) | `Snap Target`, `Snap Radius` |
| **DragAwayToFade (4)** | Kéo ra xa chỗ ban đầu → mờ đi và biến mất | — |

#### Bật attachment Spine khi snap xong (rất hay dùng cho SnapToTarget)

Muốn khi thả tóc giả vào đúng chỗ thì **hiện tóc lên nhân vật**, dùng `On Complete Event`:
1. **Target**: node Spine nhân vật (vd `KhongTuocSpine`) — node phải có component `Character`.
2. **Component / Handler**: `Character` → `turnOnSlotAttachments` (bật) hoặc `turnOffSlotAttachments` (tắt).
3. **CustomEventData**: định dạng `slotName, attachmentName` cho **1 cặp**; nhiều cặp ngăn nhau bằng **dấu chấm phẩy `;`**:
   ```
   Hair_F/Added_Bangs, Hair/Added_Bangs
   ```
   - **Dấu phẩy** ngăn *slot* với *attachment* (không phải ngăn 2 slot!).
   - Nhiều cặp: `slot1, att1; slot2, att2`
   - Bỏ phần attachment → mặc định attachment = tên slot.

> ⚠️ **Tên slot của Spine này chứa dấu `/`** (vd slot `Hair_F/Added_Bangs`, attachment `Hair/Added_Bangs`). Vì vậy **không** dùng `/` làm dấu phân cách — dùng `,` (slot↔attachment) và `;` (giữa các cặp).
>
> 🔎 **Xem tên slot/attachment chính xác:** chọn node `CharacterManager` → mục **4. Editor Actions** → tick **🔘 Get All Slots** (sau khi đã gán Target Test Character). Hoặc mở file skeleton `assets/_Game/2.MySpine/KhongTuoc_Json_38/KhongTuoc.json` xem mục `slots`.
>
> Cocos truyền `CustomEventData` dưới dạng **chuỗi**; `turnOnSlotAttachments` đã hỗ trợ cả chuỗi (từ Event) lẫn mảng (từ code). Nếu snap xong mà tóc **không hiện**: kiểm tra tên slot/attachment đúng chưa (phân biệt hoa/thường, đúng cả phần `/`), và `Snap Target` đã gán chưa.

---

## 6. Setup `MakeupTarget` (vùng được vẽ lên)

Gắn `MakeupTarget` lên Node đại diện vùng vẽ (thường đặt tại vị trí trên mặt/tóc, có `Collider2D`).

**Nhóm 1 – Target & ID**
- **Target Character**: component `Character` của Spine nhân vật
- **Required Makeup ID**: **phải trùng `Makeup ID` bên `DrawItemController`**

**Nhóm 2 – Turn On Settings** (cái sẽ hiện ra khi vẽ)
- **Slot Name** + **Attachment Name**: 1 cặp slot/attachment Spine cần bật
- **Multiple Turn On Slots**: bật nhiều cặp cùng lúc
- **Object To Turn On** / **Multiple Objects To Turn On**: bật Node thường (không phải Spine)

**Nhóm 3 – Turn Off Settings** (cái bị xoá đi khi vẽ cái mới)
- **Slot Name To Turn Off** / **Multiple Turn Off Slots**
- **Turn Off Only When Done**: chỉ tắt khi đã 100% (không mờ dần trong lúc vẽ)

**Nhóm 5 – Draw Settings**
- **Continuous Mode**: BẬT = tăng tiến độ liên tục khi rê chuột đè lên; TẮT = tính theo số lần "quẹt vào–ra"
- **Required Draw Times**: số lần quẹt để đạt 100% (khi TẮT continuous)
- **Continuous Required Seconds**: số giây chà để đạt 100% (khi BẬT continuous)

> Cơ chế: mỗi frame cọ trúng target, `applyMakeup()` tăng `currentDrawTimes` và set alpha slot Spine = `currentDrawTimes / target`. Đạt đủ → `isApplied = true`, phát tim + animation vui.

---

## 7. Setup `DipTarget` (hộp phấn cho DipAndDraw)

Gắn `DipTarget` lên Node hộp phấn/màu:
- **Is Open**: mặc định `false` (nắp đậy → chưa nhúng được).
- Khi mở nắp, gọi `openBox()` / `OpenBox()` — thường nối vào `OnCompleteEvent` của item "nắp hộp".
- Trong lúc kéo cọ `DipAndDraw`, nếu đầu cọ (`Tip Point`) tới gần `Dip Target` < 100px **và** `isOpen = true` → `hasDipped = true`, lúc đó mới vẽ được.

---

## 8. Scale on Drag (phóng to khi cầm) — `DrawItemGraphic`

**Nhóm Scale Setup**
- **Enable Scale On Drag**: bật để item to/nhỏ khi cầm lên
- **Drag Scale Multiplier**: hệ số phóng (vd `1.5` = to lên 50%)
- **Drag Scale Duration**: thời gian tween phóng to/thu nhỏ (giây). Nhỏ = nhanh (`0.1` mặc định), lớn = chậm mượt

Thêm 2 trường góc xoay:
- **Spawn Rotation**: góc lúc nằm yên
- **Drag Rotation**: góc lúc cầm lên

**Lưu ý quan trọng (đã từng gây bug):**
1. `DrawItemGraphic` phải gắn **cùng node bị kéo** (cùng node `DrawItemMovement`). Nếu gắn ở node cha còn kéo node con (hoặc ngược lệch), việc phóng to có thể không đúng node.
2. Không cần lo node bị đổi parent khi kéo (item tạm nhảy lên Canvas). Manager tự lưu **world scale gốc** ngay lúc cầm (`CaptureBaseline`) rồi quy đổi lại, nên scale luôn về đúng dù parent có scale khác 1.
3. Nếu tick Enable mà **không thấy to lên**: kiểm tra đã tick đúng component trên đúng node chưa (mỗi item có `DrawItemGraphic` riêng).

---

## 9. Các Manager phụ trợ (tuỳ chọn / bên ngoài)

Trong code có gọi tới một số Manager qua `globalThis`/`window` với optional chaining — nghĩa là **có thì chạy, không có thì bỏ qua** (không lỗi):

| Manager | Dùng để | Trạng thái trong project |
|---|---|---|
| `CharacterManager` | Mặc đồ Spine, phát animation vui/giận | ✅ Có sẵn (`Manager/CharacterManager.ts`) |
| `Ply_SoundManager` | Phát FX/BGM | ✅ Có sẵn (`ScriptTemplate`) |
| `Ply_Pool` | Object pool (tim, hiệu ứng đúng/sai) | ✅ Có sẵn (`ScriptTemplate`) |
| `DrawItemManager` | Quản lý map, tiến độ theo map, spawn tim | ⚠️ Gọi qua globalThis, **chưa có** file trong `Manager/` |
| `ProgressTrackingManager` | Cộng tiến độ tổng | ⚠️ Chưa có, gọi phòng thủ |
| `HandHintManager` | Bàn tay gợi ý | ⚠️ Chưa có, gọi phòng thủ |
| `SpineBoneManager` | Mở/đóng bone theo item | ⚠️ Chưa có, gọi phòng thủ |
| `GameManager` | Bật/tắt map, chuyển màn, GotoStore | ⚠️ Chưa có, gọi phòng thủ |

> Nếu cần các chức năng chuyển map / hint / progress tổng, phải tạo các Manager này và đăng ký vào `globalThis` (vd gán `globalThis.DrawItemManager = { Instance: this }` trong `onLoad`). Enum `FxType` và `PoolType` đã có sẵn để cấu hình âm thanh/pool.

---

## 10. Checklist nhanh khi thêm 1 đồ vật mới

- [ ] Node có `BoxCollider2D` phủ đúng vùng bấm
- [ ] Có `DrawItemController` + chọn đúng **Item Type**
- [ ] Có `DrawItemMovement` (không cần chỉnh gì, tự lưu spawn)
- [ ] Có `DrawItemGraphic` (chỉ cần nếu muốn xoay/scale khi cầm)
- [ ] **Makeup ID** (nếu là item vẽ) trùng với **Required Makeup ID** của target
- [ ] Gán `Tip Point` (item vẽ), `Snap Target` (item snap), `Dip Target` (item dip)
- [ ] Gán `Closed Sprite` / `Open Sprite` nếu có 2 trạng thái
- [ ] Node nằm dưới Canvas, đúng Layer đã set ở `DrawInputManager`

---

## 11. Troubleshooting

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| Bấm vào item không cầm được | Thiếu `Collider2D`; chưa bật Physics 2D; sai Layer |
| Cầm được nhưng không vẽ lên mặt | `Makeup ID` ≠ `Required Makeup ID`; thiếu `Tip Point`; target thiếu `Target Character` |
| Item `DipAndDraw` vẽ ngay không cần nhúng | Chưa gán `Dip Target`, hoặc quên set `DipTarget.isOpen` |
| Tick Enable Scale On Drag mà không to lên | `DrawItemGraphic` gắn sai node; hoặc tick nhầm item khác |
| Item không bay về chỗ cũ | Node bị đổi parent ngoài luồng; kiểm tra `DrawItemMovement.originalParent` |
| Không có âm thanh | Chưa có `Ply_SoundManager` trong scene, hoặc chưa gán clip cho `FxType` |
| Chuyển map/hint không chạy | Các Manager tương ứng (`DrawItemManager`, `HandHintManager`...) chưa được tạo/đăng ký |

---

*Cập nhật lần cuối: 2026-08-07. Áp dụng cho Cocos Creator 3.7.4, scene `GameplayScene`.*
