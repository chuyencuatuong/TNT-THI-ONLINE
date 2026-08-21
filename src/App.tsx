import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { PublicReportPage } from "./pages/PublicReportPage";
import { StudentDashboard } from "./pages/StudentDashboard";
import { ExamTakingPage } from "./pages/ExamTakingPage";
import { ResultPage } from "./pages/ResultPage";
import { TeacherDashboard } from "./pages/TeacherDashboard";
import { TeacherQuestionBank } from "./pages/TeacherQuestionBank";
import { TeacherExamList } from "./pages/TeacherExamList";
import { TeacherExamEditor } from "./pages/TeacherExamEditor";
import { TeacherStudentDetail } from "./pages/TeacherStudentDetail";

// Tách riêng (lazy load) vì trang này kéo theo thư viện đọc file .docx khá nặng
// (mammoth.js) — chỉ giáo viên mới cần, không nên bắt học sinh tải về mỗi lần vào web.
const TeacherExamImport = lazy(() =>
  import("./pages/TeacherExamImport").then((m) => ({ default: m.TeacherExamImport })),
);

function RequireRole({
  role,
  children,
}: {
  role: "teacher" | "student";
  children: JSX.Element;
}) {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="page-loading">Đang tải...</div>;
  if (!session || !profile) return <Navigate to="/dang-nhap" replace />;
  if (profile.role !== role) {
    return <Navigate to={profile.role === "teacher" ? "/giao-vien" : "/hoc-sinh"} replace />;
  }
  return children;
}

export default function App() {
  const { session, profile, loading } = useAuth();

  return (
    <Routes>
      <Route path="/bao-cao/:token" element={<PublicReportPage />} />

      <Route element={<Layout />}>
        <Route path="/dang-nhap" element={<LoginPage />} />

        <Route
          path="/"
          element={
            loading ? (
              <div className="page-loading">Đang tải...</div>
            ) : !session ? (
              <Navigate to="/dang-nhap" replace />
            ) : !profile ? (
              <Navigate to="/dang-nhap" replace />
            ) : (
              <Navigate to={profile.role === "teacher" ? "/giao-vien" : "/hoc-sinh"} replace />
            )
          }
        />

        <Route
          path="/hoc-sinh"
          element={
            <RequireRole role="student">
              <StudentDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/lam-bai/:examId"
          element={
            <RequireRole role="student">
              <ExamTakingPage />
            </RequireRole>
          }
        />
        <Route
          path="/ket-qua/:attemptId"
          element={
            <RequireRole role="student">
              <ResultPage />
            </RequireRole>
          }
        />

        <Route
          path="/giao-vien"
          element={
            <RequireRole role="teacher">
              <TeacherDashboard />
            </RequireRole>
          }
        />
        <Route
          path="/giao-vien/ngan-hang-cau-hoi"
          element={
            <RequireRole role="teacher">
              <TeacherQuestionBank />
            </RequireRole>
          }
        />
        <Route
          path="/giao-vien/de-thi"
          element={
            <RequireRole role="teacher">
              <TeacherExamList />
            </RequireRole>
          }
        />
        <Route
          path="/giao-vien/tao-de-tu-word"
          element={
            <RequireRole role="teacher">
              <Suspense fallback={<div className="page-loading">Đang tải...</div>}>
                <TeacherExamImport />
              </Suspense>
            </RequireRole>
          }
        />
        <Route
          path="/giao-vien/de-thi/:examId"
          element={
            <RequireRole role="teacher">
              <TeacherExamEditor />
            </RequireRole>
          }
        />
        <Route
          path="/giao-vien/hoc-sinh/:studentId"
          element={
            <RequireRole role="teacher">
              <TeacherStudentDetail />
            </RequireRole>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
