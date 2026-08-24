# Spine Texture Optimizer

Extension cho Cocos Creator 3.x: **downscale texture page của Spine và tự sửa `.atlas`**, giữ nguyên
kích thước hiển thị của nhân vật trong game (Mode A). Không bao giờ ghi đè bản gốc.

```
hero/                        hero_50/
├── hero.json          →     ├── hero.json      (copy nguyên si)
├── hero.atlas               ├── hero.atlas     (xy / size / orig / offset đã scale)
└── hero.png  2048²          └── hero.png  1024²
```

VRAM `2048×2048×4 = 16 MB` → `1024×1024×4 = 4 MB` (giảm 75%).

---

## 1. Cài đặt

Thư mục này nằm sẵn trong `extensions/` của project nên Cocos tự nhận. Sau khi copy vào project khác:

1. Mở Cocos Creator → menu **Extension → Extension Manager → Project** → bật `spine-texture-optimizer`.
2. Mở panel: menu **Tool → Spine Texture Optimizer** (hoặc **Panel → Spine Texture Optimizer**).

Không cần `npm install`, không cần biên dịch TypeScript, không cần `sharp`:
toàn bộ code là CommonJS thuần và dùng codec PNG tự viết (chỉ dựa vào `zlib` có sẵn trong Node).
Nếu trong project **có** `sharp` thì tool tự động dùng `sharp` cho nhanh hơn — và cũng nhờ vậy mới
resize được `.webp`.

> Ghi chú: máy này chưa cài Node nên source không dùng TypeScript (không có `tsc` để build).
> Cấu trúc file vẫn giữ đúng như thiết kế (`core/atlas-parser`, `core/atlas-scaler`, …), muốn đổi sang
> `.ts` sau này chỉ cần thêm type annotation và một bước build.

---

## 2. Dùng panel

```
Source .atlas   [ db://assets/0.Spines/Win/capi-win.atlas.txt ] [Browse]
Scale           [ 50% ▼ ]
Resize filter   [ Lanczos3 ▼ ]
Output folder   [ db://assets/spine-generated/capi-win_50 ]
Mode            [ A - keep character display size ▼ ]
[✓] Backup an existing output folder
[ ] Overwrite output folder if not empty
[✓] Refresh asset database when finished
[ ] Count mipmaps in the VRAM estimate

[Analyze] [Generate] [Cancel]          [Show output]
```

* **Analyze** = chạy khô, không ghi file nào. Hiện: kích thước từng page trước/sau, số region,
  region nhỏ nhất sau resize, dung lượng disk, VRAM, và toàn bộ cảnh báo.
* **Generate** chỉ chạy khi Analyze không còn lỗi (`ERROR`).

## 3. Dùng CLI (Milestone 1 — không cần mở editor)

```bash
node cli.js --atlas assets/0.Spines/Win/capi-win.atlas.txt --scale 0.5 --analyze
node cli.js --atlas assets/0.Spines/Win/capi-win.atlas.txt --scale 0.5 --out out/capi_50
```

Máy chưa cài Node? Dùng luôn Node bên trong Cocos Creator (Windows PowerShell):

```powershell
$env:ELECTRON_RUN_AS_NODE=1
& "C:\ProgramData\cocos\editors\Creator\3.7.4\CocosCreator.exe" cli.js --atlas <file.atlas> --scale 0.5 --analyze
```

Tham số: `--scale 0.5|0.25|50|25`, `--filter lanczos3|mitchell|triangle|box|nearest`, `--out <dir>`,
`--analyze`, `--overwrite`, `--backup`, `--mipmaps`, `--mode A|B`.

## 4. Chạy test

```powershell
$env:ELECTRON_RUN_AS_NODE=1
& "C:\ProgramData\cocos\editors\Creator\3.7.4\CocosCreator.exe" test\run.js
```

32 test: parser (2 dialect, nhiều page, tên region có space/slash/dấu hai chấm, CRLF, round-trip
byte-exact), scaler (bounds, trim, rotate, 25/50/75%, region 1px), PNG codec, resize (halo alpha,
alpha coverage), và end-to-end generate (rollback khi lỗi, chặn ghi đè source, cancel).

---

## 5. Mode A và Mode B

| | Mode A (mặc định) | Mode B |
|---|---|---|
| Texture | giảm | giảm |
| `.atlas` | sửa | sửa |
| Skeleton `.json` / `.skel` | copy nguyên si | copy nguyên si |
| Kích thước nhân vật trong game | **giữ nguyên** | nhỏ đi theo hệ số |

Mode A đúng cho gần như mọi trường hợp: attachment geometry của Spine nằm trong skeleton
(`width`/`height` của attachment), atlas chỉ mô tả UV + trim, nên thu nhỏ texture không đổi kích thước
hiển thị.

Mode B tool **không** tự sửa skeleton (file `.skel` là binary, sửa rất rủi ro). Tool chỉ resize
texture + atlas và nhắc bạn tự đặt hệ số bù:

```
displayCompensation = 1 / textureScale     // scale 0.5 → 2
```

Đặt ở `SkeletonData` khi load hoặc scale của node — và chỉ đặt **sau khi test thật** với đúng version
Spine runtime đang dùng, đừng mặc định nhân scale.

---

## 6. Cách sửa `.atlas`

Parser đọc theo **key**, không thay số bằng regex toàn file, nên tên region chứa số/`.png`/dấu hai
chấm/khoảng trắng đều an toàn. Key không hiểu được giữ nguyên vị trí và định dạng — scale 100% cho ra
file y hệt từng byte.

| Field | Xử lý |
|---|---|
| page `size` | lấy từ **kích thước PNG thật** sau resize (không tin số khai báo trong atlas) |
| `xy`, `bounds` | scale |
| `size` (region), `orig`, `offset`, `offsets` | scale |
| `split`, `pad` | scale |
| `rotate`, `index`, `filter`, `repeat`, `pma`, `format` | giữ nguyên |

Quy tắc làm tròn — **làm tròn theo cạnh**, không làm tròn riêng x và w:

```js
x2 = Math.round(x * scale);
w2 = Math.max(1, Math.round((x + w) * scale) - x2);
```

Nhờ vậy hai region dính nhau trong atlas gốc vẫn dính nhau sau khi scale (không hở khe, không đè
nhau), và region chạm mép page vẫn chạm đúng mép. Sau đó vẫn còn một bước clamp + kiểm tra
`x + w <= pageW` (có tính hoán đổi w/h cho region `rotate`), và `offset + size <= orig` cho region trim.

Cảnh báo khi region nhỏ hơn 4px sau resize. 50% và 25% làm tròn chuẩn; 75% có thể lệch 1px — tool báo
`INFO` khi bạn chọn hệ số không phải lũy thừa 2.

## 7. Resize texture

Mặc định **Lanczos3**. Mọi phép resize đều chạy trên dữ liệu **premultiplied alpha** rồi un-premultiply
lại — nếu resize thẳng RGBA thô, màu của pixel trong suốt (thường là đen) sẽ bị kéo vào mép và tạo
viền đen quanh nhân vật. Nếu atlas khai báo `pma: true`, kết quả được giữ ở dạng premultiplied và cờ
`pma` giữ nguyên.

Filter: `lanczos3` (nét, mặc định), `mitchell` (mềm hơn), `triangle`, `box`, `nearest` (chỉ cho pixel art).

## 8. Nhiều texture page

Atlas nhiều page được xử lý đầy đủ: mỗi page resize riêng theo cùng hệ số, mỗi dòng `size:` của page
được cập nhật theo kích thước PNG thật. Dòng chỉ được coi là page khi nó đứng đầu một block page —
region tên `effects/spark.png` vẫn là region (có test cho case này).

## 9. Quy trình generate

```
Analyze → Validate → tạo thư mục tạm (.<output>.tmp-<pid>-<time>)
       → resize từng page → ghi .atlas → copy .json/.skel
       → backup output cũ (nếu có) → move thư mục tạm vào output → refresh Asset DB
```

Mọi thứ ghi vào thư mục tạm trước. Lỗi giữa chừng (PNG hỏng, hết đĩa, bấm Cancel) → xoá thư mục tạm,
**không** để lại folder Spine ghi dở, và source không bị đụng tới.

## 10. Cảnh báo tool phát hiện

`PAGE_MISSING` (thiếu file page — đã bắt được thật trên `Harpy.atlas.txt` của project này),
`PAGE_SIZE_MISMATCH` (size khai báo ≠ PNG thật), `PAGE_NOT_PNG`, `PAGE_NOT_POT`, `PAGE_TINY`,
`PAGE_SKIPPED`, `PAGE_OUTSIDE` (page trỏ ra ngoài folder), `REGION_TINY`, `REGION_CLAMPED`,
`REGION_OUT_OF_BOUNDS`, `REGION_UNPARSED`, `ATLAS_FORMAT_UNKNOWN`, `MULTI_SKELETON` (nhiều skeleton
dùng chung atlas), `OUTPUT_IS_SOURCE`, `OUTPUT_INSIDE_SOURCE`, `OUTPUT_NOT_EMPTY`, `SCALE_NOT_DYADIC`,
`PMA`, `MODE_B`.

`ERROR` chặn Generate; `WARNING`/`INFO` chỉ hiển thị.

## 11. Kiểm thử trong Cocos (nên làm trước khi thay asset thật)

Tạo scene so sánh `OriginalSpine` / `OptimizedSpine`, cùng position, scale, animation, timeScale, skin,
rồi kiểm tra: bounding box, mesh attachment, clipping attachment, phần bị trim, region rotate (UV),
rung 1px khi chạy animation, viền đen quanh nhân vật, custom material, và so sánh Web build vs Native
build. Nên test các animation `idle`, `run`, `attack`, animation có clipping và animation có deform/mesh.

## 12. Chưa có (theo đúng MVP)

Batch nhiều Spine cùng lúc, ghi đè trực tiếp lên source, tự sửa skeleton data, tự thay reference trong
prefab/scene, preview render trực tiếp trong panel, và xuất WebP khi không có `sharp`.
