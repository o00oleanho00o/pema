# Prescription Splitter (Chrome Manifest V3)

Extension local-only để đọc prescription đang hiển thị trên clinic, đối chiếu với một danh mục `danhsach.xlsx`, tách item thành `ĐƠN THUỐC` và `PHIẾU TƯ VẤN`, rồi xem trước/in bằng mẫu do extension dựng lại.

## Quy tắc phân loại

Column `E` (`Loại`) trong `danhsach.xlsx` là nguồn sự thật duy nhất:

- Sau khi chuẩn hóa, chỉ `Thuốc` -> `PRESCRIPTION` -> `ĐƠN THUỐC`.
- Mọi giá trị khác (`TPCN`, `Mỹ Phẩm`, giá trị lạ) và cả ô trống/thiếu `Loại` -> `CONSULTATION` -> `PHIẾU TƯ VẤN`.
- Item không match được danh mục không tự động vào tư vấn; item đó là `UNKNOWN` và phải chọn thủ công `Đơn thuốc`, `Phiếu tư vấn`, hoặc `Không in`.

## Bảo mật và read-only

- Chỉ đọc DOM đã render sau khi người dùng bấm **Đọc đơn hiện tại** trên `https://annam.vttechsolution.vn/*`.
- Không gọi clinic API, không gửi request đến clinic, không gửi `POST`/`PUT`/`PATCH`/`DELETE`.
- Không bấm nút Print của clinic, không sửa form/prescription/dữ liệu ứng dụng.
- Không đọc/lưu cookie, token, bearer credential hoặc lịch sử bệnh nhân.
- Catalog, matching settings và alias thủ công chỉ nằm trong `chrome.storage.local`.
- Prescription hiện tại nằm trong bộ nhớ popup và payload preview tạm thời trong `chrome.storage.session`; URL chỉ có một token ngẫu nhiên, không chứa dữ liệu bệnh nhân. Preview xóa payload/token sau lần đọc đầu tiên.
- `fetch` duy nhất của extension (nếu cần) chỉ đọc `default-catalog.json` đã đóng gói trong extension; không có CDN, font từ xa, telemetry, analytics, AI hoặc server trung gian.

## Cài extension unpacked

1. Mở Chrome/Edge/Brave và vào `chrome://extensions` (Edge có thể dùng `edge://extensions`).
2. Bật **Developer mode** ở góc phải.
3. Bấm **Load unpacked**.
4. Chọn đúng thư mục chứa file `manifest.json`: `E:\codex\indon` (không chọn thư mục con `danhsach`).
5. Mở trang clinic `https://annam.vttechsolution.vn/...`, mở prescription preview bình thường nhưng không bấm Print của clinic.
6. Bấm biểu tượng extension, chọn **Đọc đơn hiện tại**.
7. Sau khi kiểm tra route, bấm **Xem trước**, rồi dùng nút in của preview extension.

Khi sửa file, quay lại `chrome://extensions` và bấm **Reload** trên thẻ extension.

## Import danh mục lần đầu

Danh mục mẫu nằm ở `danhsach\danhsach.xlsx`.

1. Mở popup và bấm **Import danh sách**, hoặc bấm biểu tượng bánh răng để mở **Cài đặt Tách đơn**.
2. Chọn file `danhsach.xlsx` mới nhất.
3. Xem thống kê rồi commit.
4. Nếu file có mã/tên trống, mã/tên trùng, sai cấu trúc hoặc không có cột bắt buộc, import bị từ chối và danh mục cũ vẫn được giữ nguyên.

Không cần chọn Excel trong workflow hằng ngày. Khi file thay đổi, chỉ cần import lại trong Settings; không cần build lại extension.

## Workflow hằng ngày

1. Mở bệnh nhân trong clinic.
2. Mở prescription preview hiện tại.
3. Mở extension -> **Đọc đơn hiện tại**.
4. Kiểm tra bệnh nhân, chẩn đoán, số lượng, đơn vị và route từng item.
5. Xử lý hết `UNKNOWN`/`FUZZY_REVIEW`; preview chỉ bật khi mọi item đã được route hoặc chọn `Không in`.
6. Bấm **Xem trước**.
7. Chọn **In đơn thuốc**, **In phiếu tư vấn**, hoặc **In tất cả**. Đây là `window.print()` của trang extension, không phải nút Print của clinic.

## Dữ liệu Excel đã kiểm tra

Workbook `danhsach\danhsach.xlsx`:

- Một sheet: `Sheet`; header ở dòng 1.
- 115 dòng sản phẩm (dòng 2-116); các dòng format trống phía sau không được tính.
- Cột: `#`, `Mã`, `Tên`, `Đơn vị`, `Loại`, `VAT`, `Giá bán trước thuế`, `Giá bán sau thuế`, `Quản lý`, `Mã lô hàng`, `Số seri`.
- Không có mã trống, tên trống, mã trùng, tên trùng, công thức, bảng merged hoặc VBA.
- Column `Loại`: 30 `Thuốc`, 64 `Mỹ Phẩm`, 14 `TPCN`, 7 ô trống.
- Kết quả route: 30 `ĐƠN THUỐC`, 85 `PHIẾU TƯ VẤN` (78 dòng non-`Thuốc` có giá trị + 7 dòng thiếu `Loại`).

## Đọc DOM và matching

`content.js` tìm title đang visible (`ĐƠN THUỐC`/`PHIẾU TƯ VẤN`), đi lên form/container tương ứng và đọc các anchor `dataid` ổn định (`custname`, `CustAge`, `medicinename`, `quantity`, `unitName`, `NoteMedicine`, `Diagnostic`, `datestring`...). Cách này tránh vùng lịch sử phía sau modal. Hai fixture hiện trả đúng lần lượt 2 và 3 item, không nhân đôi item từ vùng nền. URL lưu trong model chỉ gồm origin/path; query string có thể chứa mã bệnh nhân hoặc token nên được loại bỏ.

Matching theo thứ tự:

1. Exact product code (nếu DOM có code đáng tin cậy; fixture hiện tại không có code cạnh item).
2. Exact normalized name.
3. Fuzzy suggestion bảo thủ (`FUZZY_REVIEW`) nếu bật trong Settings.
4. `UNKNOWN`, bắt buộc review.

Tên và type được chuẩn hóa Unicode, khoảng trắng, dấu gạch và chữ hoa/thường; các giá trị có nghĩa như `10mg`, `0.1%`, `40ml` không bị xóa.

## Mẫu in

`print-template.js` là một builder dùng chung cho cả hai output. Hai document giữ cùng logo, header, slogan, phone/address, specialty icons, patient block, diagnosis, item typography, notes, QR/Zalo, date và chữ ký; chỉ title và danh sách item lọc khác nhau. Item trong mỗi document được đánh số lại từ 1.

- Kích thước theo UI/screenshot clinic và yêu cầu cuối: **A5 landscape, 210 mm x 148 mm** (`@page { size: A5 landscape; ... }`).
- Tài liệu HTML tải về có inline style cũ ghi `148mm x 210mm`, nhưng UI live/screenshot hiển thị `210 mm x 148 mm`; implementation ưu tiên UI live và yêu cầu cuối.
- Asset tĩnh đã bundle: `assets/clinic-logo.png`, `assets/specialty-icons.png`, `assets/zalo-qr.png`.
- Preview và print dùng cùng một builder; không gọi endpoint `/Print/print`.
- Mỗi nhóm output là một tài liệu liền mạch, rộng đúng `210 mm` và cao tối thiểu `148 mm`. Preview không dùng `overflow: hidden`, nên item hoặc hướng dẫn dài không bị che.
- Khi in, Chromium tự phân trang theo khổ A5 ngang. Item/footer dùng quy tắc tránh ngắt bên trong khi còn đủ chỗ; danh sách dài tự chảy sang các trang vật lý tiếp theo thay vì bị chia bằng ước lượng số ký tự.
- Tab preview được đặt thành `Tách đơn - <tên khách>`; nếu thiếu tên thì dùng `Tách đơn - Xem trước`.

Visual comparison đã khớp cấu trúc chính và asset gốc. Khác biệt còn lại nhỏ: icon phone/location dùng glyph Unicode thay vì FontAwesome runtime của clinic, một số khoảng cách header/footer và line wrapping có thể lệch vài pixel tùy Chromium/printer.

## Quyền được khai báo

`manifest.json` chỉ dùng:

- `scripting`: inject `content.js` vào tab clinic sau thao tác click của người dùng.
- `storage`: `storage.local` cho catalog/settings/overrides và `storage.session` cho payload preview một lần.
- Host permission `https://annam.vttechsolution.vn/*`: giới hạn quyền đọc/inject đúng domain clinic.

Không khai báo `tabs`, `cookies`, `webRequest`, `clipboardWrite`, `<all_urls>` hoặc quyền mạng rộng.

## File chính

- `manifest.json`: Manifest V3, action, options page, quyền tối thiểu.
- `popup.html`, `popup.js`, `styles.css`: đọc, import, review route và mở preview.
- `content.js`: DOM reader read-only.
- `catalog.js`, `xlsx-importer.js`, `default-catalog.json`, `jszip.min.js`: parse/validate/index/match Excel local.
- `options.html`, `options.js`, `options.css`: import catalog, thống kê, fuzzy settings.
- `preview.html`, `preview.js`, `preview.css`, `print-template.js`: preview/print local và template chung.
- `donthat/`: HTML/CSS/assets clinic đã tải để làm reference; runtime ứng dụng clinic không được dùng.

## Kiểm tra đã chạy

```powershell
Get-ChildItem -File -Filter *.js | ForEach-Object { node --check $_.FullName }
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
node test-catalog.cjs
node test-content.cjs
node test-content-hidden.cjs
node test-preview.cjs
node test-preview-long.cjs
node test-preview-regressions.cjs
```

Kết quả hiện tại: tất cả JS hợp lệ; Manifest V3 hợp lệ; catalog 115/30/85; hai DOM fixture đúng 2 và 3 item; các node ẩn không làm thay đổi kết quả đọc; preview mixed case tạo đúng hai document và title theo tên khách. Case thực tế `Trần Thị Thùy Dung` in đủ hai sản phẩm tư vấn trên một trang A5; case ba thuốc không bị tách sớm; case 30 sản phẩm tự chảy sang 4 trang A5 và PDF vẫn chứa item đầu/cuối. Import trực tiếp `danhsach.xlsx` cũng đã kiểm tra: sheet `Sheet`, header 1, 115 rows, không duplicate/invalid.

## Giới hạn đã biết

- DOM layout của clinic có thể thay đổi; nếu các `dataid`/container ổn định bị đổi, reader sẽ báo không tìm thấy thay vì đoán dữ liệu.
- Product code chỉ dùng khi code xuất hiện đáng tin cậy trong item DOM; không gọi API để bổ sung code.
- FontAwesome runtime không bundle; phone/location hiện là glyph thay thế.
- Preview payload one-time nên reload lại tab preview sau khi đã mở sẽ cần mở preview mới từ popup.
