import { useAuth } from "../lib/auth";
import { LearningProfile } from "../components/LearningProfile";

/** Trang "Hồ sơ năng lực" của học sinh (Module 2, 27/09/2026). */
export function StudentLearningProfile() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <div className="result-page result-page--wide">
      <h2>Hồ sơ năng lực</h2>
      <LearningProfile studentId={profile.id} audience="student" />
    </div>
  );
}
