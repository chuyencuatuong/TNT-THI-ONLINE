import { useState } from "react";
import * as api from "../lib/api";
import type { ExamTag, ExamTagKind } from "../lib/types";

/**
 * Chọn 1 thư mục/tuyển tập (kind="folder") hoặc chương trình/kỳ thi
 * (kind="term") TỪ DANH SÁCH CÓ SẴN, kèm nút "+ Tạo mới" khi thật sự cần
 * thêm — thay cho ô gõ tự do (datalist) trước đây, để tránh giáo viên vô
 * tình tạo nhiều thư mục/chương trình na ná nhau do gõ sai chính tả.
 * Dùng chung cho cả 2 loại vì cấu trúc dữ liệu giống hệt nhau (exam_tags).
 */
export function TagPicker({
  kind,
  label,
  tags,
  value,
  onChange,
  onCreated,
  createdBy,
  placeholder,
}: {
  kind: ExamTagKind;
  label: string;
  tags: ExamTag[];
  value: string | null;
  onChange: (id: string | null) => void;
  onCreated: (tag: ExamTag) => void;
  createdBy: string;
  placeholder: string;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const tag = await api.createExamTag({ kind, name, created_by: createdBy });
      onCreated(tag);
      onChange(tag.id);
      setCreating(false);
      setNewName("");
    } catch (err) {
      console.error(err);
      alert(`Không tạo được "${name}" — có thể tên này đã tồn tại.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="tag-picker">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          style={{ minWidth: 220 }}
        >
          <option value="">{placeholder}</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {!creating && (
          <button type="button" className="btn-secondary" onClick={() => setCreating(true)}>
            + {label} mới
          </button>
        )}
      </div>
      {creating && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
          <input
            type="text"
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={`Tên ${label.toLowerCase()} mới...`}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
          >
            {saving ? "Đang tạo..." : "Tạo"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
          >
            Huỷ
          </button>
        </div>
      )}
    </div>
  );
}
