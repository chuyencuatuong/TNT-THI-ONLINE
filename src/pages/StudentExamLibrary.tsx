import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../lib/api";
import {
  EMPTY_CASCADE_FILTER,
  filterExamsByCascade,
  groupExamsByFolder,
  isCascadeFilterActive,
  type CascadeFilter,
} from "../lib/examLibrary";
import type { ExamRow, ExamTag, ExamTopicRow, Topic } from "../lib/types";

function ExamListCard({ exam }: { exam: ExamRow }) {
  return (
    <div className="card">
      <div className="card-title">{exam.title}</div>
      {exam.description && <p className="card-desc">{exam.description}</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Link className="btn-primary" to={`/lam-bai/${exam.id}`}>
          Bắt đầu làm bài
        </Link>
        {exam.drive_link && (
          <a className="btn-secondary" href={exam.drive_link} target="_blank" rel="noreferrer">
            Tải đề
          </a>
        )}
      </div>
    </div>
  );
}

export function StudentExamLibrary() {
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [folders, setFolders] = useState<ExamTag[]>([]);
  const [terms, setTerms] = useState<ExamTag[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [examTopics, setExamTopics] = useState<ExamTopicRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<CascadeFilter>(EMPTY_CASCADE_FILTER);
  const [openFolderId, setOpenFolderId] = useState<string | null | "__none__">(null);

  useEffect(() => {
    Promise.all([
      api.listExams(),
      api.listExamTags("folder"),
      api.listExamTags("term"),
      api.listTopics(),
      api.listAllExamTopics(),
    ]).then(([e, f, t, tp, et]) => {
      setExams(e);
      setFolders(f);
      setTerms(t);
      setTopics(tp);
      setExamTopics(et);
      setLoading(false);
    });
  }, []);

  const folderNameById = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const examTopicIds = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of examTopics) {
      const list = map.get(row.exam_id) ?? [];
      list.push(row.topic_id);
      map.set(row.exam_id, list);
    }
    return map;
  }, [examTopics]);

  const topicsForGrade = useMemo(
    () => (filter.grade === null ? [] : topics.filter((t) => t.grade === filter.grade)),
    [topics, filter.grade],
  );

  const filterActive = isCascadeFilterActive(filter);
  const filteredExams = useMemo(
    () => filterExamsByCascade(exams, filter, examTopicIds),
    [exams, filter, examTopicIds],
  );

  const groups = useMemo(() => groupExamsByFolder(exams, folderNameById), [exams, folderNameById]);
  const openGroup = groups.find((g) => (g.folderId ?? "__none__") === openFolderId);

  function clearFilter() {
    setFilter(EMPTY_CASCADE_FILTER);
  }

  if (loading) return <div className="page-loading">Đang tải...</div>;

  return (
    <div className="dashboard">
      <div className="page-header-row">
        <h2>Kho đề</h2>
        <Link className="btn-secondary" to="/hoc-sinh">
          ← Về trang chủ
        </Link>
      </div>

      <div className="library-layout">
        <aside className="library-filter">
          <h3>Bộ lọc</h3>
          <div className="form-row">
            <label>Khối</label>
            <select
              value={filter.grade ?? ""}
              onChange={(e) =>
                setFilter({
                  grade: e.target.value ? (Number(e.target.value) as 10 | 11 | 12) : null,
                  termId: null,
                  topicId: null,
                })
              }
            >
              <option value="">— Tất cả —</option>
              <option value="10">Lớp 10</option>
              <option value="11">Lớp 11</option>
              <option value="12">Lớp 12</option>
            </select>
          </div>
          <div className="form-row">
            <label>Chương trình</label>
            <select
              value={filter.termId ?? ""}
              disabled={filter.grade === null}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, termId: e.target.value || null, topicId: null }))
              }
            >
              <option value="">— Tất cả —</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>Chương</label>
            <select
              value={filter.topicId ?? ""}
              disabled={filter.termId === null}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, topicId: e.target.value || null }))
              }
            >
              <option value="">— Tất cả —</option>
              {topicsForGrade.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {filterActive && (
            <button type="button" className="btn-secondary" onClick={clearFilter}>
              Bỏ lọc
            </button>
          )}
        </aside>

        <div className="library-content">
          {filterActive ? (
            <>
              <p className="empty-hint">
                Đang lọc — hiện {filteredExams.length} đề khớp điều kiện (không nhóm theo thư mục).
              </p>
              {filteredExams.length === 0 ? (
                <p className="empty-hint">Không có đề nào khớp bộ lọc hiện tại.</p>
              ) : (
                <div className="card-list">
                  {filteredExams.map((exam) => (
                    <ExamListCard key={exam.id} exam={exam} />
                  ))}
                </div>
              )}
            </>
          ) : openGroup ? (
            <>
              <button type="button" className="btn-link" onClick={() => setOpenFolderId(null)}>
                ← Tất cả thư mục
              </button>
              <h3>{openGroup.folderName}</h3>
              <div className="card-list">
                {openGroup.exams.map((exam) => (
                  <ExamListCard key={exam.id} exam={exam} />
                ))}
              </div>
            </>
          ) : exams.length === 0 ? (
            <p className="empty-hint">Chưa có đề thi nào.</p>
          ) : (
            <div className="card-list">
              {groups.map((group) => (
                <button
                  key={group.folderId ?? "__none__"}
                  type="button"
                  className="card card--folder"
                  onClick={() => setOpenFolderId(group.folderId ?? "__none__")}
                >
                  <div className="card-title">{group.folderName}</div>
                  <p className="card-desc">{group.exams.length} đề thi</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
