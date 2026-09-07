# Image Resizer (Cocos Creator extension)

Thu nhỏ ảnh PNG / JPG / WebP / BMP theo **phần trăm** hoặc theo **kích thước đích**,
luôn giữ đúng tỷ lệ khung hình (không méo, không kéo giãn).

Mở: **Tool > Image Resizer** (menu Extension/Tool của editor).

## Cách dùng

1. **Images**: kéo ảnh (hoặc cả folder) từ panel Assets vào ô kẻ đứt, hoặc bấm
   *Add selected in Assets* (đang chọn gì trong Assets thì thêm cái đó), hoặc *Browse files...*.
2. **Size**: chọn chế độ
   - *Percent*: 20 %, 30 %, 50 %... (có nút preset). `2048x2048` @ 30 % -> `614x614`.
   - *Fit inside W x H*: ảnh nằm gọn trong hộp. `2048x2048` fit `600x600` -> `600x600`;
     `2048x1024` fit `600x600` -> `600x300`.
   - *Longest side = N*: cạnh dài nhất = N px.
   - *Width = N* / *Height = N*: cố định 1 cạnh, cạnh kia tự tính.
   - *Allow upscale*: mặc định tắt, ảnh nhỏ hơn đích sẽ giữ nguyên.
   - *Round to multiple of 2/4*: nếu cần kích thước chẵn.
3. **Output**:
   - *Overwrite original* (mặc định): ghi đè file gốc, **giữ nguyên .meta / uuid** nên
     SpriteFrame, prefab, scene tham chiếu không bị mất. Bản gốc được backup vào
     `temp/image-resizer-backup/<timestamp>/...` (nút *Show backup*).
   - *New file with suffix*: tạo file mới cạnh file gốc, ví dụ `hero_600x450.png`
     (token `{w}` `{h}` `{p}`).
   - *Another folder*: ghi vào folder khác (db:// hoặc đường dẫn).
   - *Format*: giữ nguyên, hoặc đổi sang PNG / JPG / WebP.
4. Bấm **Preview** để xem kích thước mới và dung lượng trước, rồi **Resize**.

Sau khi chạy xong tool tự `refresh-asset` để editor import lại ảnh.

## Engine

| Ảnh vào -> ra | Engine |
| --- | --- |
| PNG -> PNG | Built-in (giải mã + Lanczos thuần JS, resample trên premultiplied alpha nên không bị viền đen quanh sprite trong suốt). Không cần cài gì. |
| JPG / WebP / BMP, hoặc đổi định dạng | `ffmpeg.exe`: tìm ở `extensions/image-resizer/tools/ffmpeg/`, rồi `extensions/playable-size-inspector/tools/ffmpeg/`, rồi PATH. |
| Không có ffmpeg (Windows) | PowerShell + System.Drawing (PNG / JPG / BMP). |

Ghi file ra tệp tạm rồi mới đổi tên đè lên đích, nên ghi đè tại chỗ không bao giờ để lại ảnh hỏng dở.

## Test

```bash
node extensions/image-resizer/test/run.js
```
