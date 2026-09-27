/**
 * 8 phân mục của Hồ sơ đo lường kết quả (ResultPage) — nguồn DUY NHẤT cho
 * cả mục lục dính (ResultNav), scrollspy và tiêu đề từng phân mục, để đổi
 * tên/thứ tự chỉ cần sửa 1 chỗ.
 */
export interface ResultSectionMeta {
  id: string;
  /** "01".."08" — số thứ tự học thuật hiển thị ở mục lục và đầu phân mục. */
  index: string;
  /** Nhãn ngắn trên mục lục (giữ 1 dòng ở cột 220-248px). */
  navLabel: string;
  title: string;
  lede: string;
}

export const RESULT_SECTIONS: ResultSectionMeta[] = [
  {
    id: "sec-01",
    index: "01",
    navLabel: "Điểm số & hiệu suất",
    title: "Điểm số & hiệu suất tổng thể",
    lede: "Kết quả chung của lượt làm bài và cách điểm phân bổ qua 3 phần thi.",
  },
  {
    id: "sec-02",
    index: "02",
    navLabel: "Điểm hao hụt theo chuyên đề",
    title: "Bản đồ điểm hao hụt theo chuyên đề",
    lede: "Điểm rơi dồn vào bài học nào — nơi ôn tập mang lại hiệu quả nâng điểm lớn nhất.",
  },
  {
    id: "sec-03",
    index: "03",
    navLabel: "Bản chất sai lệch tư duy",
    title: "Bản chất sai lệch tư duy",
    lede: "Mỗi câu chưa đúng xuất phát từ đâu: khái niệm, quy trình, tính toán hay nhịp độ.",
  },
  {
    id: "sec-04",
    index: "04",
    navLabel: "Hồ sơ nhận thức 4 cấp độ",
    title: "Hồ sơ nhận thức 4 cấp độ",
    lede: "Độ chính xác ở từng bậc tư duy, từ Nhận biết đến Vận dụng cao.",
  },
  {
    id: "sec-05",
    index: "05",
    navLabel: "Quy luật & nhịp độ",
    title: "Quy luật sai lệch & nhịp độ làm bài",
    lede: "Thời gian dành cho từng câu và những câu còn để trống.",
  },
  {
    id: "sec-06",
    index: "06",
    navLabel: "Truy vết nguyên nhân",
    title: "Truy vết nguyên nhân gốc rễ",
    lede: "Những bài nền tảng có thể liên quan tới điểm nghẽn hiện tại.",
  },
  {
    id: "sec-07",
    index: "07",
    navLabel: "Kế hoạch khắc phục",
    title: "Kế hoạch khắc phục kiến thức",
    lede: "Các bước ôn tập cụ thể, theo thứ tự ưu tiên.",
  },
  {
    id: "sec-08",
    index: "08",
    navLabel: "Bản kiểm tra chi tiết",
    title: "Bản kiểm tra chi tiết",
    lede: "Đối chiếu đáp án đã chọn với đáp án đúng và lời giải của từng câu.",
  },
];

export const REVIEW_SECTION_ID = "sec-08";
