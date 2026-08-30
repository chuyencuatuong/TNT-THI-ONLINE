/**
 * Logic thuần cho "Kho đề": nhóm đề theo thư mục/tuyển tập (thẻ mặc định) và
 * lọc theo bộ lọc phân cấp Khối -> Chương trình -> Chương. Tách riêng khỏi
 * component để dễ unit test không cần render React/gọi Supabase.
 */

export const UNCATEGORIZED_FOLDER_LABEL = "Chưa phân loại";

export interface LibraryExam {
  id: string;
  title: string;
  grade: 10 | 11 | 12 | null;
  folder_id: string | null;
  term_id: string | null;
}

export interface FolderGroup<T extends LibraryExam> {
  folderId: string | null;
  folderName: string;
  exams: T[];
}

/**
 * Nhóm danh sách đề theo thư mục (exam_tags kind='folder'), sắp xếp tên A-Z
 * (tiếng Việt), nhóm "Chưa phân loại" (folder_id null) luôn xuống cuối.
 */
export function groupExamsByFolder<T extends LibraryExam>(
  exams: T[],
  folderNameById: Map<string, string>,
): FolderGroup<T>[] {
  const map = new Map<string, FolderGroup<T>>();
  for (const exam of exams) {
    const key = exam.folder_id ?? "__none__";
    if (!map.has(key)) {
      map.set(key, {
        folderId: exam.folder_id,
        folderName: exam.folder_id
          ? folderNameById.get(exam.folder_id) ?? UNCATEGORIZED_FOLDER_LABEL
          : UNCATEGORIZED_FOLDER_LABEL,
        exams: [],
      });
    }
    map.get(key)!.exams.push(exam);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.folderId === null) return 1;
    if (b.folderId === null) return -1;
    return a.folderName.localeCompare(b.folderName, "vi");
  });
}

export interface CascadeFilter {
  grade: 10 | 11 | 12 | null;
  termId: string | null;
  topicId: string | null;
}

export const EMPTY_CASCADE_FILTER: CascadeFilter = {
  grade: null,
  termId: null,
  topicId: null,
};

export function isCascadeFilterActive(filter: CascadeFilter): boolean {
  return filter.grade !== null || filter.termId !== null || filter.topicId !== null;
}

/**
 * Lọc đề theo Khối -> Chương trình -> Chương. Mỗi tầng chỉ áp dụng khi đã
 * chọn (khác null); tầng "Chương" khớp nếu đề có chứa chương đó trong danh
 * sách chương đã gán (1 đề có thể thuộc nhiều chương).
 */
export function filterExamsByCascade<T extends LibraryExam>(
  exams: T[],
  filter: CascadeFilter,
  examTopicIds: Map<string, string[]>,
): T[] {
  return exams.filter((exam) => {
    if (filter.grade !== null && exam.grade !== filter.grade) return false;
    if (filter.termId !== null && exam.term_id !== filter.termId) return false;
    if (filter.topicId !== null) {
      const topicIds = examTopicIds.get(exam.id) ?? [];
      if (!topicIds.includes(filter.topicId)) return false;
    }
    return true;
  });
}
