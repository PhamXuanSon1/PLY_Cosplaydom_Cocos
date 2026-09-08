# Unity → Cocos Creator 3.x Particle Bridge

Chuyển hiệu ứng Shuriken của Unity sang `cc.ParticleSystem` bằng cách **copy thông số**,
không bake frame, không chụp ảnh, không sprite-sheet giả lập.

Kết quả import ra chỉ gồm asset engine thuần:

- node có component `cc.ParticleSystem` + `cc.ParticleSystemRenderer`
- file `.mtl` dùng effect `builtin-particle`
- texture gốc của particle

**Không có script runtime nào đi kèm.** Xoá extension đi thì hiệu ứng vẫn chạy y nguyên.

---

## 1. Cài đặt

**Unity** — copy `Assets/__ExportParticle/` vào project. Menu mới: `Tools ▸ Cocos Particle`.

**Cocos** — copy thư mục `unity-particle-importer/` vào một trong hai chỗ:

| Phạm vi | Đường dẫn |
|---|---|
| Chỉ project này | `<CocosProject>/extensions/unity-particle-importer` |
| Mọi project | `~/.CocosCreator/extensions/` (Win: `%USERPROFILE%\.CocosCreator\extensions\`) |

Mở `Extension ▸ Extension Manager`, bật `unity-particle-importer`.
Menu mới: `Extension ▸ Unity Particle ▸ Import Effect…`

---

## 2. Quy trình

**Bên Unity**

1. `Tools ▸ Cocos Particle ▸ Export Window`
2. Chọn GameObject gốc của effect (`Use Selection`), hoặc gắn component
   `ToolExportEffect` lên các effect rồi bấm `Collect Tagged`
3. Chọn thư mục output → `Export`

Mỗi effect ra một thư mục độc lập:

```
Fx_Explosion/
├── Fx_Explosion.uparticle.json     ← toàn bộ thông số 12 module
├── Fx_Explosion_Textures/          ← texture gốc, copy nguyên byte
│   ├── smoke_01.png
│   └── spark_atlas.png
├── Fx_Explosion_Meshes/            ← chỉ có khi dùng Mesh particle (.obj)
└── README.md                       ← báo cáo: cái gì đã mô phỏng, cái gì lệch
```

**Bên Cocos**

1. Copy nguyên thư mục đó vào máy (không cần bỏ vào `assets/`)
2. `Extension ▸ Unity Particle ▸ Import Effect…`
3. Trỏ tới file `.uparticle.json`, chọn nơi import → `Import`

Importer sẽ: copy texture vào project + set đúng wrap/filter/mipmap như Unity →
sinh `.mtl` đúng blend state → dựng node ParticleSystem → (tuỳ chọn) lưu prefab.

Batch cả thư mục: `Extension ▸ Unity Particle ▸ Import Folder (batch)…`

---

## 3. Bảng ánh xạ thông số

### 3.1 Map thẳng 1-1 (giống hệt)

| Unity | Cocos | Ghi chú |
|---|---|---|
| Duration / Looping / Prewarm / Play On Awake | `duration` / `loop` / `prewarm` / `playOnAwake` | |
| Start Delay / Lifetime / Speed | `startDelay` / `startLifetime` / `startSpeed` | CurveRange giữ nguyên tangent |
| Start Size (3D) | `startSize3D`, `startSizeX/Y/Z` | |
| Start Rotation (3D) | `startRotation3D`, `startRotationX/Y/Z` | cả hai đều lưu **radian**, giữ nguyên |
| Start Color | `startColor` (GradientRange) | 5 mode khớp 1-1 |
| Gravity Modifier | `gravityModifier` | quy đổi theo `Physics.gravity` |
| Simulation Speed | `simulationSpeed` | |
| Max Particles | `capacity` | |
| Rate over Time / Distance | `rateOverTime` / `rateOverDistance` | |
| Bursts | `bursts[]` | `cycleCount` → `repeatCount` (số lần bắn, tối thiểu 1) |
| Shape: Sphere / Hemisphere / Cone / Box / Circle | `shapeType` + `emitFrom` | kèm Shell/Edge/Volume |
| Radius / Radius Thickness / Angle / Arc | `radius` / `radiusThickness` / `angle` / `arc` | |
| Arc Mode Random / Loop / PingPong | `arcMode` | |
| Velocity over Lifetime (XYZ) | `velocityOvertimeModule` | |
| Limit Velocity + Drag + Dampen | `limitVelocityOvertimeModule` | |
| Force over Lifetime | `forceOvertimeModule` | |
| Color / Size / Rotation over Lifetime | các module `*OvertimeModule` | |
| Texture Sheet Animation (Grid) | `textureAnimationModule` | |
| Noise (strength/frequency/scroll/octaves/remap) | `noiseModule` | curve → giá trị trung bình |
| Trails | `trailModule` | |
| Render Mode Billboard/Stretch/H/V/Mesh | `renderMode` | enum trùng số |
| Velocity Scale / Length Scale | `velocityScale` / `lengthScale` | |

### 3.2 Khác biệt đã xử lý âm thầm

| Vấn đề | Cách xử lý |
|---|---|
| Unity thuận tay trái, Cocos thuận tay phải | Lật Z: `p → (x, y, −z)`, `q → (−x, −y, z, w)`; lật cả velocity/force Z và winding của mesh |
| Đơn vị góc của particle | Unity script trả **radian**; Cocos cũng lưu **radian** (`@radian`, Inspector chỉ hiển thị ra độ) → giữ nguyên, **không** nhân `Rad2Deg`. Riêng `ShapeModule.angle`/`arc` là accessor nhận **độ** nên vẫn xuất theo độ |
| `cullMode` của shader Unity | Luôn ép về `none` — billboard do Cocos tự sinh, cull Back sẽ làm effect biến mất (`builtin-particle` gốc cũng dùng `none`) |
| `tintColor` của `builtin-particle` | Shader tính `2.0 × color × tintColor × tex` nên trung tính là **128**, không phải 255 |
| Material của Trail | Dùng `builtin-particle-trail` (vertex shader dựng ribbon), không dùng chung với material hạt |
| `Alignment` = Local | Unity hiểu là "theo trục của transform emitter" (tức world rotation), còn Cocos `Local` chỉ đọc `node.getRotation()` — rotation so với **cha**. Nên map sang Cocos `World` (`getWorldRotation`), nếu không thì xoay node cha sẽ không có tác dụng gì |
| `Simulation Space`: Unity `Local=0, World=1` — Cocos `World=0, Local=1` | Đảo giá trị |
| Gravity: Unity nhân `Physics.gravity`, Cocos nhân hằng 9.8 | Nhân thêm `|Physics.gravity.y| / 9.8` |
| Node trung gian không có ParticleSystem sẽ mất | Xuất transform **tương đối với root**, gắn phẳng dưới root → world transform khớp tuyệt đối |
| Shader legacy `Particles/Additive` nhân tint ×2 trong shader | Nhân đôi tint trước khi gộp vào `startColor` |
| Tint `_TintColor` / `_BaseColor` của material | Gộp vào `startColor` (Cocos không có slot tint riêng theo mode) |
| Wrap/filter/mipmap của texture | Ghi thẳng vào `.meta` của ảnh khi import |

### 3.3 Unity có, Cocos **không** có → mô phỏng lại

| Module Unity | Cocos mô phỏng bằng |
|---|---|
| **Size by Speed** | Ước lượng speed profile theo tuổi hạt (start speed + gravity + velocity module), lấy mẫu curve by-speed rồi **nhân vào Size over Lifetime** |
| **Color by Speed** | Tương tự, nhân gradient by-speed vào **Color over Lifetime** |
| **Rotation by Speed** | Tương tự, **cộng vào Rotation over Lifetime** (cùng đơn vị góc/giây) |
| **Sub Emitters** | Mỗi sub-emitter thành **một node ParticleSystem con**. Loại `Death` được cộng thêm `startDelay` = lifetime trung bình của hạt cha, `Birth` chạy từ t=0 |
| **Radial velocity** | Cộng thẳng vào `startSpeed` — chính xác tuyệt đối với emitter Sphere/Circle/Cone vì hướng radial trùng hướng phát |
| **Shape = Rectangle** | Box có `boxThickness.z = 1` (dẹt) |
| **Shape = Edge** | Box mỏng dài đúng `length` |
| **Shape = Donut** | Circle với `radiusThickness = donutRadius / radius` |
| **Noise Damping** | Cocos không chia strength theo frequency → chia sẵn `strength / frequency` khi export |
| **Render Mode = None** | Billboard + tắt renderer |
| **Blend mode của mọi shader** | Đọc `_SrcBlend`/`_DstBlend`/`_BlendOp`/`_Mode`, quy về 7 preset và **ghi override blendState** vào `.mtl` (không phụ thuộc technique index của `builtin-particle`) |
| **Mesh particle** | Xuất `.fbx` theo 3 tầng ưu tiên (xem mục 4.1) để Cocos import |

Mỗi lần mô phỏng đều được ghi vào `README.md` của bản export và hiện màu xanh trong panel import.

### 3.4 Không thể mô phỏng (báo warning, cần art-direct tay)

`Inherit Velocity` · `Orbital Velocity` · `Collision` · `Triggers` · `Lights` ·
`External Forces` · `Custom Data` · `Ring Buffer` · `Soft Particles` ·
Texture Sheet mode `Sprites` (hãy gộp thành atlas dạng lưới rồi export lại) ·
Trail mode `Ribbon` · Renderer `Pivot` / `Flip` / `Min-Max Particle Size` ·
Shape emit từ Mesh/Sprite · Noise tác động lên rotation & size ·
Burst `probability` < 1.

Danh sách chính xác cho từng effect nằm ở mục **Warnings** trong `README.md` của bản export.

---

## 4. Tuỳ chọn export

| Tuỳ chọn | Mặc định | Ý nghĩa |
|---|---|---|
| `Unit scale` | 1 | Nhân mọi khoảng cách/tốc độ. Để 1 nếu scene Cocos dùng đơn vị mét |
| `Convert handedness` | on | Lật Z. **Đừng tắt** trừ khi bạn tự xử lý hệ trục |
| `Bake *-by-Speed modules` | on | Bật/tắt phần mô phỏng ở mục 3.3 |
| `Export sub-emitters` | on | Sub-emitter thành node con |
| `Fold material tint into color` | on | Gộp tint shader vào start color |
| `Bake resolution` | 16 | Số mẫu khi dựng lại curve từ speed profile |

| `Mesh format` | FBX | Định dạng mesh cho particle Render Mode = Mesh |

Component `ToolExportEffect` (tuỳ chọn) cho phép override tên thư mục, `unitScale`,
bỏ qua khi batch, và ghi ghi chú vào README của bản export.

### 4.1 Mesh particle xuất ra `.fbx` thế nào

Exporter thử lần lượt 3 cách, dừng ở cách đầu tiên thành công:

| # | Cách | Khi nào dùng | Chất lượng |
|---|---|---|---|
| 1 | **Copy nguyên file `.fbx` gốc** | Mesh đến từ một file `.fbx` trong project | Không mất gì: giữ nguyên normal, mọi UV set, smoothing group, tên object |
| 2 | **Unity FBX Exporter** (`com.unity.formats.fbx`) | Package đã cài trong project | Chuẩn Autodesk, do Unity ghi |
| 3 | **ASCII FBX 7.4 tự sinh** | Mesh procedural, primitive, hoặc nguồn `.obj`/`.blend` | Position + normal + UV0 + vertex color |

Cách 2 được gọi bằng reflection nên **không cần** cài package — thiếu thì tự nhảy sang cách 3.

Lưu ý về hệ trục: cách 2 và 3 đã lật Z + đảo winding sẵn. Riêng **cách 1** giữ nguyên
file gốc nên phép quy đổi trục do Cocos quyết định — exporter sẽ ghi một warning nhắc
bạn kiểm tra hướng nếu mesh không đối xứng. Muốn chắc chắn thì đổi `Mesh format` sang
`Obj`, hoặc xoá file `.fbx` gốc khỏi đường dẫn asset để ép dùng cách 3.

---

## 5. Khi kết quả chưa khớp

1. Đọc `README.md` trong thư mục export — phần **Compensated** và **Warnings** nói rõ
   chỗ nào là xấp xỉ.
2. Blend sai (quá sáng / quá tối): mở `.mtl` vừa sinh, so `blendSrc`/`blendDst` với
   `_SrcBlend`/`_DstBlend` bên Unity.
3. Hạt quay quá nhanh (sai ~57 lần): ai đó đã thêm `Rad2Deg` vào `startRotationZ` /
   `rotationOverLifetime`. Cả Unity lẫn Cocos đều lưu radian — không được quy đổi.
4. Hiệu ứng lệch trục Z: bật lại `Convert handedness`.
5. Hạt quá to/nhỏ đều: chỉnh `Unit scale` rồi export lại.
