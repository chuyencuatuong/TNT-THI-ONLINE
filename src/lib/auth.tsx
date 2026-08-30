import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import type { Profile } from "./types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /**
   * true trong lúc đang tải lại hồ sơ (profile) ngay sau 1 sự kiện đăng nhập/đăng
   * ký (onAuthStateChange) — dùng để tránh hiển thị nhầm màn hình "chưa có hồ sơ"
   * cho người dùng ĐÃ có hồ sơ nhưng dữ liệu chưa kịp tải xong (xem LoginPage.tsx).
   */
  profileLoading: boolean;
  /** Đăng nhập bằng email + mật khẩu đã có sẵn tài khoản. */
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Tạo tài khoản mới bằng email + mật khẩu (không gửi email xác nhận). */
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Đổi mật khẩu khi đã đăng nhập (không cần email). */
  changePassword: (newPassword: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Gọi sau khi người dùng mới đăng nhập lần đầu, chưa có hồ sơ.
   * `extra` (thêm 24/08/2026, migration_011) chỉ có ý nghĩa khi role="student"
   * — LoginPage.tsx chỉ hiện các trường này khi chọn vai trò học sinh. Mọi
   * trường trong `extra` đều tuỳ chọn, chỉ ghi khi có giá trị. */
  createProfile: (
    fullName: string,
    role: "teacher" | "student",
    extra?: {
      dateOfBirth?: string;
      phone?: string;
      schoolName?: string;
      gender?: Profile["gender"];
      province?: string;
    },
  ) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    setProfile(data as Profile | null);
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Sau lần tải đầu tiên ở trên, mỗi lần có sự kiện đăng nhập/đăng ký/đăng
    // xuất mới (signIn/signUp gọi từ LoginPage) đều đi qua đây. Bọc bước tải
    // hồ sơ bằng profileLoading để LoginPage biết mà hiện "Đang tải..." thay vì
    // hiểu nhầm "profile vẫn null" là người dùng CHƯA có hồ sơ (trong khi thực
    // ra chỉ đang chờ dữ liệu về) — đây chính là nguyên nhân màn hình bị "kẹt"
    // sau khi đăng ký/đăng nhập mà người dùng phản ánh.
    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        if (newSession) {
          setProfileLoading(true);
          loadProfile(newSession.user.id).finally(() => setProfileLoading(false));
        } else {
          setProfile(null);
        }
      },
    );

    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }

  async function changePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function createProfile(
    fullName: string,
    role: "teacher" | "student",
    extra?: {
      dateOfBirth?: string;
      phone?: string;
      schoolName?: string;
      gender?: Profile["gender"];
      province?: string;
    },
  ) {
    if (!session) return { error: "Chưa đăng nhập." };
    const { error } = await supabase.from("profiles").insert({
      id: session.user.id,
      full_name: fullName,
      role,
      // Chỉ ghi các trường hồ sơ mở rộng (migration_011) khi thực sự có giá
      // trị — undefined -> Postgres tự lưu null, không ghi đè gì bất thường.
      date_of_birth: extra?.dateOfBirth || null,
      phone: extra?.phone || null,
      school_name: extra?.schoolName || null,
      gender: extra?.gender || null,
      province: extra?.province || null,
    });
    if (!error) await loadProfile(session.user.id);
    return { error: error?.message ?? null };
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        profileLoading,
        signIn,
        signUp,
        changePassword,
        signOut,
        createProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải dùng bên trong AuthProvider");
  return ctx;
}
