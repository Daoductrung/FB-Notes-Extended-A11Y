# FB Notes Extended A11Y

FB Notes Extended A11Y là tiện ích mở rộng cho Chrome giúp soạn note Facebook với giới hạn ký tự dài hơn, chọn đối tượng xem, thiết lập thời hạn, đính kèm nhạc và cải thiện khả năng tiếp cận cho người dùng bàn phím cũng như trình đọc màn hình.

Kho này là bản fork từ dự án gốc của DuckCIT:
[https://github.com/DuckCIT/FB-Notes-Extended](https://github.com/DuckCIT/FB-Notes-Extended)

Kho hiện tại:
[https://github.com/Daoductrung/FB-Notes-Extended-A11Y](https://github.com/Daoductrung/FB-Notes-Extended-A11Y)

## Chức Năng Của Tiện Ích

Tiện ích được xây dựng dưới dạng Chrome Extension Manifest V3 với Vite, React và TypeScript. Dự án bao gồm:

- Popup để soạn note, chọn đối tượng, thiết lập thời hạn, chọn nhạc và xem lại note vừa đăng.
- Background service worker để lấy dữ liệu phiên Facebook từ tab đang mở và gửi các GraphQL request nội bộ mà tiện ích sử dụng.
- Content script vẫn giữ phần hỗ trợ tương thích cũ để giải mã nội dung hidden note đã được mã hóa trước đây trên các trang Facebook được hỗ trợ.

Vì luồng hoạt động phụ thuộc vào các endpoint nội bộ không được Facebook công bố chính thức, thay đổi từ phía Facebook có thể làm tính năng ngừng hoạt động mà không có báo trước.

## Tính Năng

Mã nguồn hiện tại đang hỗ trợ các tính năng sau:

- Tạo note Facebook với nội dung văn bản tối đa 600 ký tự theo giới hạn đang được popup áp dụng.
- Chọn đối tượng của note: bạn bè, công khai, danh bạ hoặc danh sách bạn bè tùy chỉnh.
- Thiết lập thời hạn hiển thị bằng các mốc sẵn có hoặc nhập số phút tùy chỉnh.
- Tìm kiếm nhạc trên Facebook và nghe thử trước khi chọn.
- Chọn thời điểm bắt đầu của đoạn nhạc đính kèm bằng hai thanh trượt hỗ trợ trợ năng.
- Nghe thử đoạn nhạc 30 giây đã chọn và bật hoặc tắt phát lại ngay trong phần cắt nhạc.
- Xem lại note mới nhất mà Facebook trả về, bao gồm nội dung, nhạc đính kèm, đối tượng và thời gian hết hạn.
- Xóa note hiện tại trực tiếp trong popup khi Facebook trả về một note có thể xóa.
- Chuyển đổi giao diện popup giữa tiếng Việt và tiếng Anh.
- Giải mã nội dung hidden note kiểu cũ trên các trang Facebook được hỗ trợ thông qua content script.

## Trọng Tâm Trợ Năng

Phiên bản A11Y này bổ sung lớp cải thiện trợ năng rõ rệt cho popup:

- Dùng thanh trượt chuẩn thay cho giao diện kéo-thả trong phần cắt nhạc.
- Khu vực note vừa đăng hiển thị trạng thái rõ ràng, chi tiết note và nút xóa dễ nhận biết.
- Các hộp thoại có quản lý focus và điều khiển thân thiện hơn với bàn phím.
- Trạng thái và lỗi được thông báo qua live region.
- Nhãn điều khiển và cách diễn đạt được chỉnh lại để trình đọc màn hình đọc tự nhiên hơn.

## Cấu Trúc Dự Án

```text
dist/                  Bản build production để nạp bằng Chrome "Load unpacked"
public/                Tài nguyên tĩnh, biểu tượng và manifest của extension
src/background/        Background worker và logic gọi Facebook
src/content/           Content script cho phần tương thích giải mã nội dung cũ
src/lib/               Các helper dùng chung như trích xuất token
src/popup/             Giao diện popup React, CSS và bản dịch
popup.html             Tệp đầu vào của popup
vite.config.ts         Cấu hình build
```

## Phát Triển

Yêu cầu:

- Node.js 18 trở lên
- Google Chrome hoặc trình duyệt Chromium

Cài đặt dependencies:

```bash
npm install
```

Build production:

```bash
npm run build
```

Kiểm tra kiểu dữ liệu:

```bash
npx tsc --noEmit
```

## Nạp Vào Chrome

Sau khi chạy `npm run build`, hãy nạp tiện ích unpacked từ thư mục:

```text
dist
```

Các bước:

1. Mở `chrome://extensions/`
2. Bật `Developer mode`
3. Chọn `Load unpacked`
4. Trỏ tới thư mục `dist` của repository này

## Ghi Chú

- Tiện ích chỉ hoạt động khi tab đang mở thuộc `facebook.com` hoặc `messenger.com`.
- Việc đăng note có nhạc hiện dùng đoạn nhạc cố định 30 giây. Popup chỉ điều chỉnh được thời điểm bắt đầu vì đó là trường dữ liệu mà request Facebook trong mã nguồn này cho phép gửi.
- Dự án hiện chưa có bộ kiểm thử tự động. Cách xác minh thực tế là kiểm tra TypeScript, build production và thử trực tiếp trên Facebook.

## Ghi Công

- Tác giả gốc: DuckCIT
- Repository gốc: [https://github.com/DuckCIT/FB-Notes-Extended](https://github.com/DuckCIT/FB-Notes-Extended)
- Tác giả phiên bản A11Y: Đào Đức Trung

## Giấy Phép

MIT
