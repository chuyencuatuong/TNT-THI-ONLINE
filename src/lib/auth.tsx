import {
  createContext,
  useContext,
  useEffect,
  useRef,
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
  /**
   * Luồng khách (migration_023): đăng nhập ẨN DANH + tạo hồ sơ khách, để làm
   * đề công khai mà không cần đăng ký. Đã có phiên (khách hoặc tài khoản) thì
   * không làm gì. Cần bật "Allow anonymous sign-ins" trong Supabase.
   */
  startGuestSession: (source?: string | null) => Promise<{ error: string | null }>;
  /**
   * Khách tạo tài khoản: gắn email + mật khẩu vào CHÍNH user ẩn danh hiện tại
   * (Supabase giữ nguyên user id) nên mọi bài đã làm tự thuộc tài khoản mới.
   * `pendingEmail` = true khi dự án đang bật xác nhận email — phải bấm link
   * trong email trước khi đăng nhập bằng email được.
   */
  upgradeGuest: (email: string, password: string) => Promise<{ error: string | null; pendingEmail: boolean }>;
  /** Tải lại hồ sơ (sau khi tự cập nhật profiles ở nơi khác). */
  reloadProfile: () => Promise<void>;
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

  // Chỉ nhận kết quả của lần tải GẦN NHẤT: khi khách bắt đầu làm bài,
  // onAuthStateChange tải hồ sơ (lúc đó chưa có) song song với
  // startGuestSession tải lại sau khi tạo hồ sơ — kết quả cũ về sau không
  // được ghi đè hồ sơ mới.
  const loadSeq = useRef(0);
  async function loadProfile(userId: string) {
    const seq = ++loadSeq.current;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (seq === loadSeq.current) setProfile(data as Profile | null);
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

  async function startGuestSession(source?: string | null) {
    const { data: current } = await supabase.auth.getSession();
    let userId = current.session?.user.id ?? null;
    if (!userId) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user) {
        return { error: error?.message ?? "Không tạo được phiên làm bài." };
      }
      userId = data.user.id;
    }
    const { data: existing } = await supabase.from("profiles").select("id").eq("id", userId).maybeSingle();
    if (!existing) {
      const { error } = await supabase.from("profiles").insert({
        id: userId,
        full_name: "Khách",
        role: "student",
        is_guest: true,
        signup_source: source ? source.slice(0, 60) : null,
      });
      if (error) return { error: error.message };
    }
    await loadProfile(userId);
    return { error: null };
  }

  async function upgradeGuest(email: string, password: string) {
    const { data, error } = await supabase.auth.updateUser({ email, password });
    if (error) return { error: error.message, pendingEmail: false };
    // Dự án tắt xác nhận email: email gắn ngay, phiên hết "ẩn danh" sau khi
    // làm mới token. Bật xác nhận: email nằm ở new_email cho tới khi bấm link.
    const pendingEmail = !!data.user?.new_email && data.user.email !== email;
    if (!pendingEmail) {
      await supabase.auth.refreshSession();
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (uid) {
        const { error: upErr } = await supabase.from("profiles").update({ is_guest: false }).eq("id", uid);
        if (upErr) return { error: upErr.message, pendingEmail: false };
        await loadProfile(uid);
      }
    }
    return { error: null, pendingEmail };
  }

  async function reloadProfile() {
    const { data } = await supabase.auth.getSession();
    if (data.session) await loadProfile(data.session.user.id);
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
        startGuestSession,
        upgradeGuest,
        reloadProfile,
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
