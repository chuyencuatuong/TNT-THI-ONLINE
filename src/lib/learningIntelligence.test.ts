import { describe, expect, it } from "vitest";
import type { TopicDiagnosis } from "./diagnosis";
import {
  buildErrorInstances,
  buildExamAutopsy,
  rankLabelingQueue,
  rationaleKey,
  responseRowToFact,
  type ResponseFactRow,
  summarizeErrorDna,
  summarizeLabelingCoverage,
  type ErrorInstance,
  type RationaleEntry,
  type StudentResponseFact,
} from "./errorIntelligence";
import {
  bucketOf,
  buildBloomBreakdown,
  buildLearningProfile,
  buildMasteryTimeline,
  combinedAccuracy,
  computeMasteryDelta,
  computeProgressStory,
  generateInsightNarrative,
  type BloomCell,
} from "./learningState";
import {
  buildLessonEvidence,
  buildPrereqTree,
  diagnosisFromTotals,
  computeRootCauseCandidates,
  ROOT_CAUSE_DISCLAIMER,
  type LessonEvidence,
  type PrereqEdge,
} from "./knowledgeGraph";
import { normalizeRationaleOptions, parseRationaleBatchResponse, type RationaleQuestionInput } from "./ai";

let seq = 0;
function fact(o: Partial<StudentResponseFact> = {}): StudentResponseFact {
  seq += 1;
  return {
    attemptId: "a1",
    examId: "e1",
    examTitle: "Đề 1",
    startedAt: "2026-09-01T02:00:00.000Z",
    questionId: `q${seq}`,
    part: 1,
    difficulty: "nhan_biet",
    topicId: "T1",
    topicName: "Chương 1",
    topicOrder: 1,
    lessonId: "L1",
    lessonName: "Bài 1",
    lessonOrder: 1,
    score: 0.25,
    maxScore: 0.25,
    timeSpentSeconds: 60,
    changeCount: 0,
    answered: true,
    chosenOption: "A",
    correctOption: "A",
    ...o,
  };
}

function inst(o: Partial<ErrorInstance> = {}): ErrorInstance {
  return {
    attemptId: "a1",
    examId: "e1",
    examTitle: "Đề 1",
    occurredAt: "2026-09-01T02:00:00.000Z",
    questionId: "q",
    part: 1,
    difficulty: "van_dung",
    topicId: "T1",
    topicName: "Chương 1",
    lessonId: "L1",
    lessonName: "Bài 1",
    chosenOption: "B",
    correctOption: "A",
    errorType: "conceptual",
    patternLabel: null,
    confidence: "high",
    reason: "",
    rationaleText: null,
    pointsLost: 0.25,
    ...o,
  };
}

function diag(sampleCount: number, avg: number, label: TopicDiagnosis["label"]): TopicDiagnosis {
  return { label, sampleCount, avgScoreRatio: avg, avgTimeRatio: 1, avgChangeCount: 0, possiblyRushed: false };
}

// ---------------------------------------------------------------------------
describe("buildErrorInstances — Error DNA on-demand", () => {
  const prior = [1, 2, 3].map(() => fact({ attemptId: "a1", startedAt: "2026-09-01T02:00:00.000Z" }));
  const late = { attemptId: "a2", examId: "e2", startedAt: "2026-09-10T02:00:00.000Z" };
  const q1 = fact({ ...late, questionId: "q1", chosenOption: "B", score: 0, timeSpentSeconds: 20 });
  const q2 = fact({ ...late, questionId: "q2", chosenOption: "C", score: 0, timeSpentSeconds: 20 });
  const q3 = fact({ ...late, questionId: "q3", part: 2, score: 0.25, maxScore: 1, chosenOption: null, correctOption: null, timeSpentSeconds: 200 });
  const q7 = fact({ ...late, questionId: "q7", chosenOption: "D", score: 0, timeSpentSeconds: 90 });
  const rationale = new Map<string, RationaleEntry>([
    [rationaleKey("q1", "B"), { errorType: "conceptual", patternLabel: "Quên ĐKXĐ", rationaleText: "Không loại x=0", verifiedByTeacher: true }],
    [rationaleKey("q7", "D"), { errorType: "calculation", patternLabel: "Sai dấu", rationaleText: null, verifiedByTeacher: false }],
  ]);
  const instances = buildErrorInstances([...prior, q1, q2, q3, q7], rationale);
  const by = (id: string) => instances.find((i) => i.questionId === id)!;

  it("chỉ tạo instance cho câu SAI có trả lời", () => {
    expect(instances.map((i) => i.questionId).sort()).toEqual(["q1", "q2", "q3", "q7"]);
  });
  it("nhãn đã xác nhận -> confidence cao, kèm pattern + mô tả", () => {
    expect(by("q1")).toMatchObject({ errorType: "conceptual", confidence: "high", patternLabel: "Quên ĐKXĐ", rationaleText: "Không loại x=0" });
  });
  it("không có nhãn, mastery trước đó vững + làm rất nhanh -> careless", () => {
    expect(by("q2")).toMatchObject({ errorType: "careless", confidence: "medium" });
  });
  it("Phần 2 làm chậm -> chưa phân loại, pointsLost đúng", () => {
    expect(by("q3")).toMatchObject({ errorType: "unclassified", pointsLost: 0.75 });
  });
  it("nhãn nháp CHƯA xác nhận bị bỏ qua", () => {
    expect(by("q7")).toMatchObject({ errorType: "unclassified", patternLabel: null });
  });
  it("lượt đầu tiên (chưa có dữ liệu trước) không bao giờ bị gán careless", () => {
    const only = buildErrorInstances([fact({ questionId: "x", chosenOption: "B", score: 0, timeSpentSeconds: 5 })], new Map());
    expect(only[0].errorType).toBe("unclassified");
  });

  it("summarizeErrorDna gom theo loại, sắp theo số lần rồi theo thứ tự cố định", () => {
    const dna = summarizeErrorDna(instances);
    expect(dna.map((d) => [d.errorType, d.count])).toEqual([
      ["unclassified", 2],
      ["conceptual", 1],
      ["careless", 1],
    ]);
    expect(dna[0].share).toBe(0.5);
    expect(dna[1].patternLabels).toEqual([{ label: "Quên ĐKXĐ", count: 1 }]);
  });

  it("buildExamAutopsy: điểm mất theo Bài + đếm câu bỏ trống", () => {
    const blank = fact({ ...late, questionId: "q8", lessonId: "L2", lessonName: "Bài 2", answered: false, chosenOption: null, score: 0 });
    const facts = [q1, q2, q3, q7, blank];
    const autopsy = buildExamAutopsy(facts, instances.filter((i) => i.attemptId === "a2"));
    expect(autopsy.totalLost).toBe(1.75);
    expect(autopsy.blankCount).toBe(1);
    expect(autopsy.highConfidenceCount).toBe(1);
    expect(autopsy.scoreLoss.map((r) => [r.name, r.pointsLost, r.wrongCount, r.blankCount])).toEqual([
      ["Bài 1", 1.5, 4, 0],
      ["Bài 2", 0.25, 0, 1],
    ]);
  });
});

describe("Hàng đợi gắn nhãn", () => {
  it("xếp theo số lượt chọn SAI giảm dần và tính độ phủ", () => {
    const ranked = rankLabelingQueue([
      { questionId: "q1", correctOption: "A", choiceCounts: { A: 5, B: 3, C: 1 }, status: "none" },
      { questionId: "q2", correctOption: "B", choiceCounts: { A: 10, B: 2 }, status: "verified" },
      { questionId: "q3", correctOption: "C", choiceCounts: {}, status: "draft" },
    ]);
    expect(ranked.map((r) => [r.questionId, r.wrongChoiceTotal])).toEqual([
      ["q2", 10],
      ["q1", 4],
      ["q3", 0],
    ]);
    expect(summarizeLabelingCoverage(ranked)).toEqual({
      totalQuestions: 3,
      verifiedQuestions: 1,
      draftQuestions: 1,
      totalWrongChoices: 14,
      coveredWrongChoices: 10,
      coveragePercent: 71,
    });
  });
  it("chưa có lượt chọn sai nào -> độ phủ null (không giả vờ 0% hay 100%)", () => {
    expect(summarizeLabelingCoverage([]).coveragePercent).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("learningState — Bloom & nhận định", () => {
  const cell = (difficulty: BloomCell["difficulty"], sampleCount: number, accuracy: number | null): BloomCell => ({
    difficulty,
    sampleCount,
    accuracy,
    label: "co_lo_hong",
  });

  it("buildBloomBreakdown luôn đủ 4 mức theo thứ tự NB->VDC", () => {
    const b = buildBloomBreakdown([fact({ difficulty: "van_dung", score: 0 }), fact({ difficulty: "van_dung" })]);
    expect(b.map((c) => [c.difficulty, c.sampleCount, c.accuracy])).toEqual([
      ["nhan_biet", 0, null],
      ["thong_hieu", 0, null],
      ["van_dung", 2, 0.5],
      ["van_dung_cao", 0, null],
    ]);
  });

  it("combinedAccuracy có trọng số theo số câu, null nếu < 2 câu", () => {
    expect(combinedAccuracy([cell("nhan_biet", 2, 1), cell("thong_hieu", 1, 0)], ["nhan_biet", "thong_hieu"])).toBeCloseTo(2 / 3);
    expect(combinedAccuracy([cell("nhan_biet", 1, 1)], ["nhan_biet", "thong_hieu"])).toBeNull();
  });

  const bloomRule1 = [cell("nhan_biet", 4, 0.9), cell("thong_hieu", 2, 1), cell("van_dung", 4, 0.25), cell("van_dung_cao", 2, 0)];
  it("Quy tắc 1: vững cơ bản, đuối vận dụng — đúng câu mẫu, đổi chủ ngữ theo người xem", () => {
    const input = { bloom: bloomRule1, errorDna: [], mastery: diag(12, 0.55, "co_lo_hong") };
    expect(generateInsightNarrative(input, "student")).toBe(
      "Em nắm vững công thức cơ bản nhưng gặp trở ngại khi bài toán cần kết hợp nhiều bước.",
    );
    expect(generateInsightNarrative(input, "teacher")).toMatch(/^Học sinh nắm vững/);
  });

  it("Quy tắc 2: 1 loại lỗi chiếm ≥50% số câu sai ĐÃ phân loại (tối thiểu 3)", () => {
    const errorDna = summarizeErrorDna([
      ...[1, 2, 3].map(() => inst({ errorType: "conceptual" })),
      inst({ errorType: "careless" }),
      ...[1, 2].map(() => inst({ errorType: "unclassified" })),
    ]);
    const text = generateInsightNarrative({ bloom: [], errorDna, mastery: diag(6, 0.4, "co_lo_hong") }, "student");
    expect(text).toMatch(/nhầm bản chất/);
  });

  it("KHÔNG kết luận 'phần lớn lỗi là...' khi đa số câu sai còn chưa xác định", () => {
    const errorDna = summarizeErrorDna([
      ...[1, 2, 3].map(() => inst({ errorType: "careless" })),
      ...Array.from({ length: 27 }, () => inst({ errorType: "unclassified" })),
    ]);
    expect(generateInsightNarrative({ bloom: [], errorDna, mastery: diag(30, 0.4, "co_lo_hong") }, "student")).toBeNull();
  });

  it("không đủ căn cứ -> null (không bịa câu chung chung)", () => {
    const errorDna = summarizeErrorDna([inst({ errorType: "conceptual" }), inst({ errorType: "careless" })]);
    expect(generateInsightNarrative({ bloom: [], errorDna, mastery: diag(4, 0.5, "co_lo_hong") }, "student")).toBeNull();
  });

  it("Quy tắc 3: cơ bản < 50%", () => {
    const bloom = [cell("nhan_biet", 3, 0.3), cell("thong_hieu", 1, 0.2)];
    expect(generateInsightNarrative({ bloom, errorDna: [], mastery: diag(4, 0.3, "mat_goc") }, "student")).toMatch(/kiến thức nền/);
  });
});

describe("learningState — Progress Story", () => {
  const now = new Date("2026-09-27T00:00:00.000Z");
  const label = "Quên đổi cận";
  const PRIOR = "2026-08-20T02:00:00.000Z";
  const RECENT = "2026-09-15T02:00:00.000Z";
  const mk = (n: number, startedAt: string, prefix: string) =>
    Array.from({ length: n }, (_, i) => fact({ questionId: `${prefix}${i}`, startedAt }));
  const errs = (list: StudentResponseFact[], n: number) =>
    list.slice(0, n).map((f) => inst({ questionId: f.questionId, occurredAt: f.startedAt, patternLabel: label }));
  const carriersOf = (...lists: StudentResponseFact[][]) =>
    new Map([[label, new Set(lists.flat().map((f) => f.questionId))]]);

  it("tỉ lệ lỗi giảm rõ (4/8 -> 1/6) -> đúng câu định lượng kèm mẫu số", () => {
    const prior = mk(8, PRIOR, "p");
    const recent = mk(6, RECENT, "r");
    const items = computeProgressStory([...errs(prior, 4), ...errs(recent, 1)], [...prior, ...recent], {
      now,
      audience: "student",
      patternQuestions: carriersOf(prior, recent),
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "giam", priorCount: 4, recentCount: 1, priorExposure: 8, recentExposure: 6 });
    expect(items[0].narrative).toBe(
      'Em đã giảm lỗi "Quên đổi cận" từ 4 lần xuống còn 1 lần trong 3 tuần qua (trên 8 và 6 câu cùng dạng).',
    );
  });

  it("KHÔNG khen giảm lỗi khi gần đây không làm câu cùng dạng", () => {
    const prior = mk(8, PRIOR, "p");
    expect(
      computeProgressStory(errs(prior, 4), prior, { now, audience: "student", patternQuestions: carriersOf(prior) }),
    ).toEqual([]);
  });

  it("KHÔNG khen khi chỉ làm ít đi mà tỉ lệ lỗi như cũ (4/20 -> 2/10)", () => {
    const prior = mk(20, PRIOR, "p");
    const recent = mk(10, RECENT, "r");
    expect(
      computeProgressStory([...errs(prior, 4), ...errs(recent, 2)], [...prior, ...recent], {
        now,
        audience: "student",
        patternQuestions: carriersOf(prior, recent),
      }),
    ).toEqual([]);
  });

  it("câu không mang nhãn lỗi đó không được tính vào mẫu số", () => {
    const prior = mk(8, PRIOR, "p");
    const unrelatedRecent = mk(6, RECENT, "u");
    expect(
      computeProgressStory(errs(prior, 4), [...prior, ...unrelatedRecent], {
        now,
        audience: "student",
        patternQuestions: carriersOf(prior),
      }),
    ).toEqual([]);
  });

  it("tỉ lệ lỗi tăng -> cảnh báo (kind 'tang')", () => {
    const recent = mk(6, RECENT, "r");
    const items = computeProgressStory(errs(recent, 3), recent, {
      now,
      audience: "teacher",
      patternQuestions: carriersOf(recent),
    });
    expect(items[0]).toMatchObject({ kind: "tang", recentCount: 3, priorCount: 0 });
  });
});

describe("learningState — dòng thời gian", () => {
  it("bucketOf theo giờ Việt Nam: tuần bắt đầu thứ Hai, tháng", () => {
    expect(bucketOf("2026-09-27T20:00:00.000Z", "week").key).toBe("2026-09-28");
    expect(bucketOf("2026-09-27T10:00:00.000Z", "week")).toMatchObject({ key: "2026-09-21", label: "Tuần 21/09" });
    expect(bucketOf("2026-09-30T18:00:00.000Z", "month").key).toBe("2026-10");
  });

  it("timeline + delta giữa 2 kỳ gần nhất đủ dữ liệu", () => {
    const facts = [
      fact({ startedAt: "2026-09-08T02:00:00.000Z" }),
      fact({ startedAt: "2026-09-08T02:00:00.000Z", score: 0, chosenOption: "B" }),
      fact({ startedAt: "2026-09-15T02:00:00.000Z" }),
      fact({ startedAt: "2026-09-15T02:00:00.000Z" }),
    ];
    const t = buildMasteryTimeline(facts, "week");
    expect(t.map((b) => [b.key, b.accuracy])).toEqual([
      ["2026-09-07", 0.5],
      ["2026-09-14", 1],
    ]);
    expect(computeMasteryDelta(t)?.deltaPoints).toBe(50);
    expect(computeMasteryDelta(t.slice(0, 1))).toBeNull();
  });
});

describe("buildLearningProfile", () => {
  it("nhóm Chương -> Bài theo đúng thứ tự PPCT, bỏ câu chưa gán Chương", () => {
    const facts = [
      fact({ topicId: "T1", topicOrder: 2, lessonId: "L1", lessonOrder: 2, lessonName: "Bài B" }),
      fact({ topicId: "T1", topicOrder: 2, lessonId: "L2", lessonOrder: 1, lessonName: "Bài A" }),
      fact({ topicId: "T2", topicName: "Chương 0", topicOrder: 1, lessonId: "L3", attemptId: "a2" }),
      fact({ topicId: null, lessonId: null }),
    ];
    const p = buildLearningProfile(facts, [], { now: new Date("2026-09-27T00:00:00Z"), audience: "student" });
    expect(p.topics.map((t) => t.id)).toEqual(["T2", "T1"]);
    expect(p.topics[1].lessons.map((l) => l.name)).toEqual(["Bài A", "Bài B"]);
    expect(p.totalAttempts).toBe(2);
    expect(p.topics[1].bloom).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
describe("knowledgeGraph", () => {
  const edges: PrereqEdge[] = [
    { lessonId: "A", prerequisiteLessonId: "B", weight: 0.8, source: "curated" },
    { lessonId: "B", prerequisiteLessonId: "C", weight: 0.5, source: "curated" },
    { lessonId: "C", prerequisiteLessonId: "A", weight: 0.4, source: "curated" },
    { lessonId: "A", prerequisiteLessonId: "D", weight: 0.3, source: "ppct_order" },
  ];
  const names = new Map([["A", "Cực trị"], ["B", "Quy tắc tính đạo hàm"], ["C", "Định nghĩa đạo hàm"], ["D", "Bài D"]]);
  const ev = (id: string, d: TopicDiagnosis, conceptual = 0, labels: string[] = []): LessonEvidence => ({
    lessonId: id,
    name: names.get(id)!,
    diagnosis: d,
    errorTypeCounts: conceptual ? { conceptual } : {},
    patternLabels: labels,
  });

  it("dựng cây có hướng, sắp theo trọng số, chống vòng lặp, giới hạn độ sâu", () => {
    const tree = buildPrereqTree("A", edges, names, new Map(), 3);
    expect(tree.children.map((c) => c.lessonId)).toEqual(["B", "D"]);
    expect(tree.children[0].children[0].lessonId).toBe("C");
    expect(tree.children[0].children[0].children).toEqual([]); // C -> A là vòng lặp
    expect(buildPrereqTree("A", edges, names, new Map(), 1).children[0].children).toEqual([]);
  });

  it("ứng viên gốc rễ: đúng khuôn câu, không khẳng định tuyệt đối, loại Bài vững/thiếu dữ liệu", () => {
    const evidence = new Map([
      ["A", ev("A", diag(6, 0.3, "mat_goc"), 3, ["Quên ĐKXĐ"])],
      ["B", ev("B", diag(5, 0.4, "co_lo_hong"), 2, ["Quên ĐKXĐ"])],
      ["C", ev("C", diag(1, 0, "chua_du_du_lieu"))],
      ["D", ev("D", diag(4, 0.9, "vung"))],
    ]);
    const candidates = computeRootCauseCandidates(buildPrereqTree("A", edges, names, evidence));
    expect(candidates.map((c) => c.lessonId)).toEqual(["B"]);
    expect(candidates[0].isCandidate).toBe(true);
    expect(candidates[0].explanation).toBe(
      'TNT nhận thấy khó khăn ở "Cực trị" có thể liên quan đến "Quy tắc tính đạo hàm" — Dựa trên: 5 câu "Quy tắc tính đạo hàm" (đúng 40%), 6 câu "Cực trị" (đúng 30%), kèm 2 lỗi tương đồng đã ghi nhận (lỗi khái niệm), cùng mẫu lỗi "Quên ĐKXĐ".',
    );
    expect(candidates[0].explanation).not.toMatch(/là nguyên nhân/);
    expect(ROOT_CAUSE_DISCLAIMER).toMatch(/không phải kết luận chắc chắn/);
  });

  it("Bài gốc không yếu -> không đưa ra ứng viên nào", () => {
    const evidence = new Map([
      ["A", ev("A", diag(6, 0.85, "vung"))],
      ["B", ev("B", diag(5, 0.4, "co_lo_hong"))],
    ]);
    expect(computeRootCauseCandidates(buildPrereqTree("A", edges, names, evidence))).toEqual([]);
  });

  it("buildLessonEvidence đếm loại lỗi (bỏ unclassified) và nhãn", () => {
    const m = buildLessonEvidence(
      [{ lessonId: "L1", name: "Bài 1", diagnosis: diag(3, 0.5, "co_lo_hong") }],
      [inst({ errorType: "conceptual", patternLabel: "X" }), inst({ errorType: "unclassified" }), inst({ lessonId: "L9" })],
    );
    expect(m.get("L1")).toMatchObject({ errorTypeCounts: { conceptual: 1 }, patternLabels: ["X"] });
  });
});

// ---------------------------------------------------------------------------
describe("AI soạn nháp nhãn lỗi — chuẩn hoá & theo lô", () => {
  it("normalizeRationaleOptions: is_correct theo đáp án thật, bỏ trùng/không hợp lệ, loại lỗi lạ -> chưa xác định (n_a)", () => {
    const out = normalizeRationaleOptions(
      [
        { option_key: "A", error_type: "conceptual", pattern_label: "x", rationale_text: "y" },
        { option_key: "b", error_type: "weird", pattern_label: " Quên đổi cận ", rationale_text: "z", ai_confidence: "high" },
        { option_key: "B", error_type: "careless" },
        { option_key: "E", error_type: "careless" },
      ],
      "A",
    );
    expect(out).toEqual([
      { option_key: "A", is_correct: true, error_type: "n_a", pattern_label: "x", rationale_text: "y", ai_confidence: "low" },
      { option_key: "B", is_correct: false, error_type: "n_a", pattern_label: "Quên đổi cận", rationale_text: "z", ai_confidence: "high" },
    ]);
  });

  it("parseRationaleBatchResponse ghép đúng câu theo ref Q1..Qn, bỏ đáp án đúng", () => {
    const q = (id: string, correct: "A" | "B"): RationaleQuestionInput => ({
      id,
      part: 1,
      content_latex: "",
      options: { choices: { A: "1", B: "2", C: "3", D: "4" } },
      correct_answer: { choice: correct },
      solution_latex: null,
      lesson_id: null,
    });
    const raw =
      "```json\n" +
      JSON.stringify({
        questions: [
          { ref: "Q2", options: [{ option_key: "A", error_type: "calculation" }, { option_key: "B", error_type: "n_a" }] },
          { ref: "Q1", options: [{ option_key: "C", error_type: "procedural" }] },
          { ref: "Q9", options: [{ option_key: "C", error_type: "procedural" }] },
        ],
      }) +
      "\n```";
    const map = parseRationaleBatchResponse(raw, [q("x1", "A"), q("x2", "B")]);
    expect(Array.from(map.keys()).sort()).toEqual(["x1", "x2"]);
    expect(map.get("x2")!.map((o) => o.option_key)).toEqual(["A"]);
    expect(map.get("x1")![0].error_type).toBe("procedural");
  });
});

describe("diagnosisFromTotals", () => {
  it("dùng đúng ngưỡng 0.8/0.4 và tối thiểu 2 câu", () => {
    expect(diagnosisFromTotals(1, 1, 1).label).toBe("chua_du_du_lieu");
    expect(diagnosisFromTotals(10, 2.5, 2.5).label).toBe("vung");
    expect(diagnosisFromTotals(10, 1, 2.5).label).toBe("co_lo_hong");
    expect(diagnosisFromTotals(10, 0.5, 2.5).label).toBe("mat_goc");
  });
});

describe("responseRowToFact — chuẩn hoá về barem chuẩn", () => {
  const row = (o: Partial<ResponseFactRow> & { part?: 1 | 2 | 3 }): ResponseFactRow => ({
    id: "r1",
    question_id: "q1",
    final_answer: { choice: "B" },
    teacher_answer: null,
    score: 0,
    sub_correct_count: null,
    time_spent_seconds: 30,
    change_count: 0,
    question: {
      part: o.part ?? 1,
      difficulty: "thong_hieu",
      default_points: null,
      correct_answer: { choice: "A" },
      topic: { id: "T1", name: "C1", order_index: 1 },
      lesson: { id: "L1", name: "B1", order_index: 1 },
    },
    attempt: { id: "a1", exam_id: "e1", started_at: "2026-09-01T00:00:00Z", exam: { title: "Đề" } },
    ...o,
  });

  it("Phần 1: dùng đáp án thầy đã sửa (teacher_answer) thay cho final_answer", () => {
    const f = responseRowToFact(row({ teacher_answer: { choice: "A" }, score: 0.25 }))!;
    expect(f).toMatchObject({ chosenOption: "A", score: 0.25, answered: true });
    const g = responseRowToFact(row({ final_answer: null, teacher_answer: { choice: "C" } }))!;
    expect(g).toMatchObject({ answered: true, chosenOption: "C", score: 0 });
  });

  it("Phần 2: tra PART2_SCORE_TABLE theo số ý đúng, bỏ qua điểm tuỳ chỉnh của đề", () => {
    const f = responseRowToFact(row({ part: 2, final_answer: { a: true }, score: 1.5, sub_correct_count: 3 }))!;
    expect(f.score).toBe(0.5);
    expect(f.maxScore).toBe(1);
  });

  it("bỏ trống -> answered=false, không có phương án", () => {
    expect(responseRowToFact(row({ final_answer: null }))).toMatchObject({ answered: false, chosenOption: null, score: 0 });
  });
});

describe("classifyError — thiếu dữ liệu thời gian", () => {
  it("timeSpentSeconds = 0 không bị hiểu là 'làm quá nhanh' -> không gán careless", () => {
    const prior = [1, 2, 3].map(() => fact({ attemptId: "a0", startedAt: "2026-09-01T00:00:00Z" }));
    const wrong = fact({ attemptId: "a9", startedAt: "2026-09-09T00:00:00Z", chosenOption: "B", score: 0, timeSpentSeconds: 0 });
    expect(buildErrorInstances([...prior, wrong], new Map())[0].errorType).toBe("unclassified");
  });
});
