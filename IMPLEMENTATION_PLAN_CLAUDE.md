# BẢN THIẾT KẾ KỸ THUẬT & KHUNG SÁNG TẠO: HỒ SƠ ĐO LƯỜNG KẾT QUẢ
### (ARCHITECTURAL & CREATIVE BLUEPRINT FOR RESULT INTELLIGENCE)
**Mã dự án:** `chuyencuatuong/TNT-THI-ONLINE`  
**Đối tượng thực thi chính (Target Executor):** Claude Opus (Lead Front-end & Product Architect)  
**Tác giả khảo sát & kiến trúc hệ thống:** Antigravity (Google DeepMind Agentic Team)  
**Tài liệu tham chiếu trực quan:** `public/demo-ket-qua-hoc-tap.html` (hoặc `demo-ket-qua-hoc-tap.html` tại thư mục gốc)

---

## LỜI TỰA DÀNH CHO CLAUDE OPUS
Chào Claude Opus,
Hệ thống thi trực tuyến TNT vừa hoàn thành việc xây dựng 3 module máy học & thống kê đo lường giáo dục:
1. **Module 1 — Exam Autopsy & Error Intelligence:** Phân tích điểm mất theo bài, bóc tách Error DNA (bản chất lỗi sai) và phát hiện mẫu lỗi lặp lại qua nhiều đề.
2. **Module 2 — Explainable Learning State:** Hồ sơ nhận thức 4 mức Bloom, các câu nhận định định lượng (deterministic) và câu chuyện tiến bộ theo tỷ lệ mắc lỗi.
3. **Module 3 — Knowledge Graph & Candidate Root-Cause:** Đồ thị tiên quyết giữa các bài học, truy vết mắt xích nguyên nhân gốc rễ dẫn đến việc mất điểm.

Dữ liệu backend đã hoàn chỉnh 100%, tuy nhiên màn hình trả kết quả học sinh (`src/pages/ResultPage.tsx`) hiện tại vẫn mang tính truyền thống (chia 4 Tab rời rạc, giao diện đóng khung card nhiều viền kiểu admin). 

Tài liệu này được soạn thảo nhằm **đóng đinh khung kỹ thuật bắt buộc** (tránh làm gãy logic hệ thống hay gọi sai contract dữ liệu), đồng thời **mở ra không gian sáng tạo tối đa** để bạn tự do vận dụng tư duy mỹ thuật, ngôn ngữ sư phạm và kỹ thuật trực quan hóa dữ liệu cao cấp.

---

# PHẦN 1: KHUNG KỸ THUẬT BẮT BUỘC (THE HARD CONSTRAINTS)

### 1.1 Ma Trận Hợp Đồng Dữ Liệu (Data Contracts Matrix)
Toàn bộ logic tính toán là **hàm thuần (pure functions)** đã được viết sẵn và kiểm thử tự động. Tuyệt đối **không viết lại logic backend** và **không bịa thêm endpoint mới**. Claude Opus chỉ cần nạp dữ liệu và truyền vào các hàm sau:

```
                                  [api.getAttempt(attemptId)]
                                  [api.getAttemptScore(attemptId)]
                                  [api.getAttemptDiagnostics(attemptId, examId)]
                                  [api.getAttemptReview(attemptId, examId)]
                                  [api.getStudentLearningBundle(studentId)]
                                  [api.listSkillPrerequisites()]
                                  [api.listLessons()]
                                                │
                                                ▼
                             ┌──────────────────────────────────────┐
                             │        ResultPage Data Pipeline      │
                             └──────────────────┬───────────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
      [errorIntelligence.ts]            [learningState.ts]            [knowledgeGraph.ts]
      • buildExamAutopsy()              • buildBloomBreakdown()        • buildPrereqTree()
      • summarizePatternRecurrence()    • generateInsightNarrative()   • computeRootCauseCandidates()
      • toPatternOccurrences()          • dominantClassifiedError()    • buildLessonEvidence()
```

#### A. Chi tiết Hàm và Types từ `src/lib/errorIntelligence.ts`
```typescript
// 1. Mổ xẻ lượt làm bài hiện tại (Exam Autopsy)
export function buildExamAutopsy(
  attemptFacts: StudentResponseFact[],
  attemptInstances: ErrorInstance[]
): ExamAutopsy;

export interface ExamAutopsy {
  totalLost: number;                // Tổng điểm mất quy về barem chuẩn
  totalPossible: number;            // Tổng điểm barem chuẩn của đề
  scoreLoss: ScoreLossRow[];        // Danh sách các Bài bị mất điểm (đã sort giảm dần)
  errorDna: ErrorDnaCluster[];      // Phân bổ các cụm loại lỗi tư duy
  wrongQuestions: ErrorInstance[];  // Danh sách chi tiết từng câu sai
  blankCount: number;               // Số câu bỏ trống
  highConfidenceCount: number;      // Số câu sai đã có nhãn giáo viên duyệt (tin cậy cao)
}

export interface ScoreLossRow {
  key: string;                      // "lesson:<id>" hoặc "topic:<id>"
  lessonId: string | null;
  name: string;                     // Tên Bài học (hoặc Tên Chương)
  pointsLost: number;               // Điểm bị mất ở Bài này
  pointsPossible: number;           // Tổng điểm tối đa của Bài này trong đề
  wrongCount: number;               // Số câu làm sai
  blankCount: number;               // Số câu bỏ trống
}

export interface ErrorDnaCluster {
  errorType: ErrorInstanceType;     // "conceptual" | "procedural" | "calculation" | "careless" | "unclassified"
  count: number;                    // Số câu thuộc loại lỗi này
  share: number;                    // Tỉ lệ trên tổng số câu sai (0..1)
  patternLabels: { label: string; count: number }[]; // Mẫu lỗi cụ thể (ví dụ: "Quên TXĐ")
}

export interface ErrorInstance {
  questionId: string;
  part: 1 | 2 | 3;
  difficulty: Difficulty | null;    // "nhan_biet" | "thong_hieu" | "van_dung" | "van_dung_cao"
  topicName: string | null;
  lessonName: string | null;
  chosenOption: string | null;      // Phương án học sinh chọn ('A'..'D' cho Phần 1)
  correctOption: string | null;     // Đáp án đúng
  errorType: ErrorInstanceType;
  patternLabel: string | null;      // Tên nhãn lỗi cụ thể
  confidence: "high" | "medium" | "low";
  reason: string;                   // Căn cứ phân loại
  rationaleText: string | null;     // Diễn giải chi tiết từ giáo viên
  pointsLost: number;
}

// 2. Tần suất lặp lại mẫu lỗi qua nhiều đề thi
export function summarizePatternRecurrence(
  occurrences: PatternOccurrence[]
): RecurringPatternResult[];

export interface RecurringPatternResult {
  patternLabel: string;
  totalCount: number;               // Tổng số lần mắc lỗi này trong lịch sử
  distinctExamCount: number;        // Số đề KHÁC NHAU đã từng xuất hiện lỗi này
  isRecurring: boolean;             // true nếu >= 2 lần trên >= 2 đề
  firstOccurredAt: string;
  lastOccurredAt: string;
}
```

#### B. Chi tiết Hàm và Types từ `src/lib/learningState.ts`
```typescript
// 1. Phân bổ độ chính xác theo 4 mức Bloom
export function buildBloomBreakdown(facts: StudentResponseFact[]): BloomCell[];

export interface BloomCell {
  difficulty: Difficulty;           // "nhan_biet" | "thong_hieu" | "van_dung" | "van_dung_cao"
  sampleCount: number;              // Số lượng câu hỏi thuộc mức này trong đề
  accuracy: number | null;          // Tỉ lệ chính xác (0..1), null nếu không có câu nào
  label: MasteryLabel;              // "vung" | "chua_chac_chan" | "co_lo_hong" | "mat_goc" | "chua_du_du_lieu"
}

// 2. Nhận định định lượng tự động (Deterministic Narrative)
export function generateInsightNarrative(
  input: { bloom: BloomCell[]; errorDna: ErrorDnaCluster[]; mastery: TopicDiagnosis },
  audience: "student" | "teacher"
): string | null;
```

#### C. Chi tiết Hàm và Types từ `src/lib/knowledgeGraph.ts`
```typescript
// 1. Dựng cây tiên quyết và tìm ứng viên nguyên nhân gốc rễ
export function buildPrereqTree(
  rootLessonId: string,
  edges: PrereqEdge[],
  lessonNames: Map<string, string>,
  evidence: Map<string, LessonEvidence>,
  maxDepth?: number                 // Mặc định = 2
): PrereqTreeNode;

export function computeRootCauseCandidates(tree: PrereqTreeNode): RootCauseCandidate[];

export interface RootCauseCandidate {
  lessonId: string;
  name: string;                     // Tên bài nền tảng nghi vấn
  depth: number;                    // Khoảng cách bậc (1 hoặc 2)
  accuracyPercent: number;          // Tỉ lệ đúng ở bài nền tảng này trong lịch sử
  sampleCount: number;              // Số câu đã làm ở bài nền tảng
  similarErrorCount: number;        // Số lỗi tương đồng đã ghi nhận
  similarErrorTypes: ErrorInstanceType[];
  explanation: string;              // Câu giải trình chuẩn mực định dạng cố định
}

export const ROOT_CAUSE_DISCLAIMER: string; // Câu lưu ý khoa học bắt buộc hiển thị
```

#### D. Chuẩn bị dữ liệu tại `ResultPage.tsx`
Trong `ResultPage.tsx`, thực hiện nạp dữ liệu song song qua `Promise.all`:
```typescript
const [attempt, score, diagnostics, review, bundle, prereq, lessons] = await Promise.all([
  api.getAttempt(attemptId),
  api.getAttemptScore(attemptId),
  api.getAttemptDiagnostics(attemptId, examId),
  api.getAttemptReview(attemptId, examId),
  api.getStudentLearningBundle(attempt.student_id),
  api.listSkillPrerequisites(),
  api.listLessons(),
]);

// Trích xuất dữ liệu của lượt thi hiện tại từ bundle
const attemptFacts = bundle.facts.filter((f) => f.attemptId === attemptId);
const attemptInstances = bundle.instances.filter((i) => i.attemptId === attemptId);

// Sinh các cấu trúc phân tích
const autopsy = buildExamAutopsy(attemptFacts, attemptInstances);
const recurringPatterns = summarizePatternRecurrence(toPatternOccurrences(bundle.instances));
const bloomBreakdown = buildBloomBreakdown(attemptFacts);
```

---

### 1.2 Quy Chuẩn Phạm Vi CSS & Bảng Màu Biên Tập Khoa Học
- **Quy chuẩn scoped:** Đặt toàn bộ CSS tại file riêng `src/components/student-result/student-intelligence.css` với tiền tố lớp `.student-intelligence-*` để tránh xung đột với 4000 dòng CSS hiện hữu của hệ thống.
- **Tương thích Dark / Light Mode 100%:** Chỉ sử dụng các biến CSS có sẵn trong `:root` và `:root[data-theme="dark"]` của `src/styles.css`.

| Ý nghĩa thiết kế | Biến CSS hệ thống | Mã màu Light | Mã màu Dark (Obsidian) |
|---|---|---|---|
| **Nền Canvas (Level 1)** | `--color-bg` | `#faf7f2` (Warm Ivory) | `#17130f` (Obsidian Warm) |
| **Bề mặt Khối (Level 2)** | `--color-card` / `--color-surface` | `#ffffff` | `#211a14` |
| **Màu Nhận Diện TNT** | `--color-primary` | `#9c1420` (Burgundy) | `#e65560` |
| **Màu Bổ Trợ Học Thuật** | `--color-accent` | `#c9973f` (Gold Ochre) | `#deb163` |
| **Chữ Chính (Graphite)** | `--color-text` | `#1b242c` | `#ede5da` |
| **Chữ Phụ / Ghi chú** | `--color-text-muted` | `#5c6773` | `#a39788` |
| **Đường Kẻ Hairline** | `--color-border` | `#e6dcce` (1px) | `#382c21` (1px) |
| **Dữ liệu Vững (Semantic 1)** | `--color-pine` / `--color-success` | `#2e7d32` / `#3e6259` | `#4caf50` |
| **Dữ liệu Hổng (Semantic 2)** | `--color-clay` / `--color-danger` | `#b5502f` | `#e06d48` |

> [!IMPORTANT]
> **Quy tắc Thẩm mỹ Tối thượng:**
> 1. **Tuyệt đối không dùng Emoji:** Xóa bỏ toàn bộ icon cảm xúc (không 📚, 💡, ⚠️, ⏱️, 🔬). Chỉ dùng icon nét thanh SVG 16x16px stroke 1.5 ở các vị trí tối cần thiết (chevron xoay, mũi tên liên kết).
> 2. **Không dùng card viền đậm, đóng khung hộp thô kệch:** Tận dụng khoảng thở tự nhiên (white-space) và đường hairline 1px.
> 3. **Chỉ dùng đúng 2 gam màu dữ liệu:** Pine Green (vững) và Clay Red (hổng). Không dùng bảng màu cầu vồng.
> 4. **100% Thuật ngữ Sư phạm Tiếng Việt:** Không dùng tiếng Anh trên giao diện học sinh.

---

### 1.3 Cấu Trúc Single Long-scroll & Layout Bất Đối Xứng
- **Loại bỏ hoàn toàn hệ thống 4 Tab cũ:** Xóa bỏ các tab `tong-quan`, `mo-xe`, `chan-doan`, `xem-lai`.
- **Desktop (>= 960px):** Bố cục 2 cột bất đối xứng:
  - **Cột trái (240px - 260px):** Sticky Mini-Navigation đánh số thứ tự học thuật `01` đến `08`, tích hợp Scrollspy tự động đánh dấu mục đang đọc khi cuộn chuột.
  - **Cột phải (chiếm toàn bộ không gian còn lại):** Dòng dẫn chuyện dài 8 phân mục liên tục.
- **Mobile (< 960px):** Cuộn dọc 1 cột mượt mà; chân màn hình có thanh **Sticky Action Bar** cố định: `[ Điểm: X/10 | Ôn lại Y câu sai → ]`.
- **Bảo toàn các tính năng nghiệp vụ cốt lõi:**
  - In phiếu kết quả: Giữ nguyên component `<ResultSlip />` (ẩn trên màn hình, chỉ xuất hiện khi `@media print`).
  - Điểm giáo viên điều chỉnh: Hiển thị minh bạch ghi chú điều chỉnh (`score.adjusted_at`, `score.adjustment_reason`, `score.original_total_score`).
  - Cảnh báo bài làm bị hủy (`attempt.invalidated`).

---

# PHẦN 2: ĐỀ BÀI THÁCH THỨC SÁNG TẠO DÀNH CHO CLAUDE OPUS (CREATIVE FREEDOM WINDOWS)

Claude Opus thân mến, đây là không gian để bạn thể hiện đẳng cấp thiết kế sản phẩm của mình. Đừng chỉ dừng lại ở việc chuyển đổi bản demo thành React code; hãy nâng tầm nó bằng các đề xuất vượt trội sau:

### 2.1 Đề bài 1: Trực quan hóa Dữ liệu (Data-Viz Innovation)
*Thách thức:* Làm thế nào để học sinh nhìn vào là thấy ngay "bức tranh tổn thất điểm" và "tháp nhận thức" mà không cảm thấy khô khan như đang xem bảng số liệu kế toán?
- **Tại Phân mục 02 (Bản đồ điểm hao hụt theo chuyên đề):** 
  - *Gợi ý sáng tạo:* Bạn có thể thử nghiệm dạng **Waterfall Loss Breakdown** (biểu đồ thác nước thể hiện từ 10.00 điểm rơi dần qua từng bài) hoặc thanh **Multi-layered Density Track** (phân biệt rõ trong số điểm mất: bao nhiêu là do câu sai Phần 1, Phần 2 hay Phần 3).
- **Tại Phân mục 04 (Hồ sơ nhận thức 4 cấp độ):**
  - *Gợi ý sáng tạo:* Thay vì các thanh bar nằm ngang đơn giản, hãy thiết kế một **Stepped Cognitive Pyramid** hoặc biểu đồ **Độ dốc năng lực (Cognitive Slope)** thể hiện trực quan độ dốc tụt giảm từ Nhận biết (100%) sang Vận dụng cao (25%). Màu sắc chuyển dần từ Pine Green sang Clay Red rất mượt mà.

### 2.2 Đề bài 2: Nghệ thuật Chuyển động Tinh vi & Tương tác Tự nhiên (Subtle & Fluid Motion)
*Thách thức:* Loại bỏ hoàn toàn sự thô cứng của dashboard quản trị, biến trang kết quả thành một bài báo khoa học tương tác cao cấp (Interactive Scientific Publication).
- **Bộ đếm số điểm (Counter Roll):** Số điểm chính nhảy mượt từ `0.00` lên số thực tế khi tải trang, sử dụng font chữ tabular figures (`font-variant-numeric: tabular-nums` hoặc `font-family: var(--font-mono)`).
- **Thanh đo năng lực mở rộng (Fluid Fill Track):** Tự động mở rộng từ `0%` sang độ dài mục tiêu khi viewport cuộn tới với đường cong bezier gia tốc tinh tế (`transition: width 0.9s cubic-bezier(0.16, 1, 0.3, 1)`).
- **Deep-link Navigation (Liên kết động thông minh):** Khi học sinh nhấp vào một thẻ lỗi sai ở Phân mục 03 (Bản chất sai lệch tư duy), màn hình tự động cuộn mượt xuống Phân mục 08 và **tự động bung mở đúng câu hỏi đó** kèm hiệu ứng highlight nhẹ trong 2 giây.

### 2.3 Đề bài 3: Văn phong Sư phạm & Micro-copy Thấu Cảm (Pedagogical Narrative Engine)
*Thách thức:* Dữ liệu chỉ là những con số vô hồn nếu không có lời giải thích mang tính nâng đỡ tinh thần học tập.
- **Nguyên tắc giọng điệu (Tone of Voice):** Khách quan, khoa học, điềm tĩnh, mang tính khích lệ và định hướng hành động. Tuyệt đối không dùng từ ngữ mang tính chỉ trích hay áp đặt tiêu cực ("kém cỏi", "yếu kém"). Thay vào đó dùng: *"Điểm nghẽn cần khơi thông"*, *"Khoảng trống nhận thức cần bù đắp"*, *"Làm chủ vững vàng"*.
- **Sinh nhận định động (Dynamic Commentary):** Khai thác triệt để hàm `generateInsightNarrative()` từ `learningState.ts`. Nếu dữ liệu chưa đủ căn cứ (dưới ngưỡng tối thiểu), hãy hiển thị lời khuyên nhẹ nhàng về việc tiếp tục luyện tập để hệ thống thu thập thêm mẫu dữ liệu.

---

# PHẦN 3: CÂY COMPONENT GỢI Ý & PHÂN KỲ THỰC THI (PHASE-BY-PHASE PLAN)

### 3.1 Cấu Trúc Cây Thư Mục Đề Xuất
Tạo mới toàn bộ component con trong thư mục `src/components/student-result/`:

```
src/components/student-result/
├── student-intelligence.css       # Toàn bộ scoped CSS (tiền tố .student-intelligence-*)
├── ResultHero.tsx                 # Phân mục 01: Điểm số & Hiệu suất tổng thể
├── ResultMetricStrip.tsx          # Phân mục 01: Dải 4 chỉ số nhịp độ & độ phủ
├── PointLossMap.tsx               # Phân mục 02: Bản đồ điểm hao hụt theo chuyên đề
├── ErrorDnaPanel.tsx              # Phân mục 03: Bản chất sai lệch tư duy
├── ThinkingProfile.tsx            # Phân mục 04: Hồ sơ nhận thức 4 cấp độ
├── PatternInsights.tsx            # Phân mục 05: Quy luật sai lệch & nhịp độ làm bài
├── RootCauseInsight.tsx           # Phân mục 06: Truy vết nguyên nhân gốc rễ trên đồ thị tiên quyết
├── NextStepPanel.tsx              # Phân mục 07: Kế hoạch khắc phục kiến thức
└── QuestionReviewSection.tsx      # Phân mục 08: Bản kiểm tra chi tiết (Progressive Disclosure)
```

---

### 3.2 Quy Trình 3 Giai Đoạn Thực Thi & Prompt Mồi Cho Claude Opus

Bạn có thể sao chép trực tiếp các prompt mồi bên dưới để gửi cho Claude Opus theo từng giai đoạn độc lập:

---

#### 🟢 GIAI ĐOẠN 1: Setup Foundation, Design Tokens, Layout Canvas & Sticky Navigation
*Mục tiêu:* Thiết lập hạ tầng CSS scoped, khung layout 2 cột bất đối xứng, sticky navigation có scrollspy và thanh mobile action bar.

> **SEED PROMPT CHO CLAUDE OPUS (GIAI ĐOẠN 1):**
> ```markdown
> Chào Claude Opus, bạn là Lead Front-end & Product Architect của dự án TNT Thi Online.
> Hãy đọc tài liệu IMPLEMENTATION_PLAN_CLAUDE.md và file tham chiếu public/demo-ket-qua-hoc-tap.html.
> 
> NHIỆM VỤ GIAI ĐOẠN 1:
> 1. Tạo file CSS `src/components/student-result/student-intelligence.css`:
>    - Scoped toàn bộ với tiền tố `.student-intelligence-*`.
>    - Định nghĩa các biến màu, typography học thuật, hiệu ứng motion (cubic-bezier) tương thích cả Light mode (Warm Ivory) và Dark mode (Obsidian).
>    - Không dùng emoji, chỉ dùng styling thanh nhã và hairline 1px.
> 2. Tạo khung layout Single Long-scroll cho `src/pages/ResultPage.tsx`:
>    - Xóa bỏ hệ thống 4 Tab cũ (`tong-quan`, `mo-xe`, `chan-doan`, `xem-lai`).
>    - Thiết lập bố cục Desktop 2 cột bất đối xứng: Cột trái là Sticky Mini-Nav đánh số `01`–`08` kèm Scrollspy tự động đổi trạng thái active khi cuộn; Cột phải là dòng chảy nội dung chứa 8 placeholder sections.
>    - Thiết lập Mobile Sticky Action Bar ở chân trang: `[ Điểm: X/10 | Ôn lại Y câu sai → ]`.
>    - Bảo lưu đầy đủ tính năng in `<ResultSlip />`, cảnh báo `invalidated`, và ghi chú điểm điều chỉnh.
> 
> Yêu cầu: Đảm bảo TypeScript compile sạch `tsc -b`, giao diện responsive mượt mà từ 375px đến 1440px.
> ```

---

#### 🟢 GIAI ĐOẠN 2: Bộ 3 Phân Tích Cốt Lõi (Core Analytic Trio)
*Mục tiêu:* Hiện thực hóa 4 phân mục đầu tiên mang lại visual punch mạnh mẽ nhất: Điểm số & Hiệu suất, Điểm hao hụt chuyên đề, Bản chất sai lệch tư duy và Hồ sơ nhận thức 4 cấp độ.

> **SEED PROMPT CHO CLAUDE OPUS (GIAI ĐOẠN 2):**
> ```markdown
> Tiếp tục Giai đoạn 2 của IMPLEMENTATION_PLAN_CLAUDE.md.
> Hãy phát triển 4 component cốt lõi trong `src/components/student-result/`:
> 
> 1. `ResultHero.tsx` & `ResultMetricStrip.tsx` (Phân mục 01):
>    - Điểm số chính dạng Counter Roll nhảy mượt từ 0.00 lên điểm thực tế.
>    - Bố cục 3 phần thi chuẩn Bộ GD&ĐT (Phần I, II, III).
>    - Dải 4 chỉ số đo lường (Độ chính xác %, Điểm rơi, Thời gian, Tỉ lệ chuẩn hóa nhãn lỗi).
> 2. `PointLossMap.tsx` (Phân mục 02):
>    - Nhận dữ liệu từ `autopsy.scoreLoss` (sắp xếp bài mất điểm nhiều nhất lên đầu).
>    - Áp dụng ý tưởng Data-viz trực quan (thanh đo mở rộng mượt mà, phân cấp Pine Green và Clay Red).
> 3. `ErrorDnaPanel.tsx` (Phân mục 03):
>    - Nhận dữ liệu từ `autopsy.errorDna` và `wrongQuestions`.
>    - Thanh phân bổ 4 loại lỗi tư duy (Khái niệm, Quy trình, Tính toán, Nhịp độ) và lưới các thẻ giải trình sư phạm.
> 4. `ThinkingProfile.tsx` (Phân mục 04):
>    - Nhận dữ liệu từ `buildBloomBreakdown(attemptFacts)` và `diagnostics.byDifficulty`.
>    - Trực quan hóa tháp nhận thức 4 bậc Bloom kèm lời nhận định chuyên môn từ `generateInsightNarrative()`.
> 
> Hãy tự do sáng tạo về mặt trực quan hóa và micro-copy sư phạm thấu cảm theo gợi ý trong Phần 2 của tài liệu. Tích hợp 4 component này vào các section 01, 02, 03, 04 của `ResultPage.tsx`.
> ```

---

#### 🟢 GIAI ĐOẠN 3: Truy Vết Gốc Rễ, Lộ Trình Hành Động & Soát Bài Tinh Gọn
*Mục tiêu:* Hoàn thiện 4 phân mục cuối cùng: Quy luật sai lệch, Truy vết nguyên nhân trên đồ thị tiên quyết, Kế hoạch khắc phục và Bản kiểm tra chi tiết từng câu dạng Progressive Disclosure; kiểm thử toàn diện.

> **SEED PROMPT CHO CLAUDE OPUS (GIAI ĐOẠN 3):**
> ```markdown
> Tiếp tục Giai đoạn 3 và hoàn thiện màn hình kết quả theo IMPLEMENTATION_PLAN_CLAUDE.md.
> Hãy phát triển 4 component cuối cùng trong `src/components/student-result/`:
> 
> 1. `PatternInsights.tsx` (Phân mục 05):
>    - Nhận diện lỗi lặp lại qua nhiều đề (`summarizePatternRecurrence`) và cảnh báo điểm nghẽn thời gian làm bài từ `diagnostics.perQuestion`.
> 2. `RootCauseInsight.tsx` (Phân mục 06):
>    - Kết nối đồ thị tiên quyết `buildPrereqTree` và `computeRootCauseCandidates` cho các bài học mất điểm nhiều nhất.
>    - Hiển thị sơ đồ mắt xích Bài nền tảng Lớp 11 ➔ Bài thi Lớp 12 kèm câu giải thích chuẩn và disclaimer bắt buộc.
> 3. `NextStepPanel.tsx` (Phân mục 07):
>    - Kế hoạch 3 bước hành động khắc phục cụ thể kèm nút CTA cuộn nhanh xuống câu sai.
> 4. `QuestionReviewSection.tsx` (Phân mục 08):
>    - Bản kiểm tra chi tiết từng câu theo cơ chế Progressive Disclosure (chỉ bung mở câu hỏi và lời giải KaTeX khi nhấp vào).
>    - Thanh chip lọc: Toàn bộ, Câu sai, Bỏ trống, Phần I, Phần II, Phần III.
>    - Hỗ trợ deep-link: Nhấp từ thẻ lỗi ở Phân mục 03 cuộn mượt xuống và mở sẵn câu tương ứng.
> 
> Hoàn tất tích hợp toàn bộ vào `ResultPage.tsx`, kiểm tra `tsc -b`, kiểm tra tính năng in PDF và kiểm tra hiển thị responsive hoàn hảo trên mobile.
> ```

---

## 4. KẾT LUẬN & KIỂM TRA ĐẦU RA
Tài liệu này đã bao quát trọn vẹn:
- Toàn bộ các kiểu dữ liệu và hàm lõi từ 3 module có sẵn trong codebase.
- Chuẩn mực thiết kế Biên tập Khoa học (không emoji, không viền hộp thô, 2 màu dữ liệu chuẩn).
- Không gian mở để Claude Opus phát huy tối đa thế mạnh về mỹ thuật, motion và ngôn ngữ sư phạm.
- Lộ trình 3 giai đoạn chia nhỏ kèm prompt mồi rõ ràng, sẵn sàng để thực thi.
