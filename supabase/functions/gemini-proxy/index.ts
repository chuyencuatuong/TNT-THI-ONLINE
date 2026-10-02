// Supabase Edge Function: gemini-proxy (02/10/2026)
//
// Trình duyệt KHÔNG còn giữ khoá Gemini. Trang web gửi yêu cầu tới hàm này kèm
// phiên đăng nhập; hàm kiểm tra người gọi là GIÁO VIÊN rồi mới chuyển tiếp tới
// Google bằng khoá cất trong secret GEMINI_API_KEY.
//
// Cài đặt (Dashboard, không cần CLI):
//   1. Edge Functions > Deploy a new function > Via Editor, đặt tên "gemini-proxy",
//      dán toàn bộ file này, bấm Deploy.
//   2. Edge Functions > Secrets: thêm GEMINI_API_KEY = khoá Gemini (nên tạo khoá
//      MỚI ở Google AI Studio, xoá khoá cũ vì khoá cũ đã nằm lộ trong mã web).
//   (Tuỳ chọn) ALLOWED_ORIGINS = danh sách origin cách nhau dấu phẩy, ví dụ
//      https://tenban.github.io,http://localhost:5173 — bỏ trống thì cho mọi origin
//      (vẫn bắt buộc đăng nhập giáo viên).

import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL_PATTERN = /^gemini-[a-z0-9][a-z0-9.\-]{0,60}$/i;
const MAX_BODY_BYTES = 25 * 1024 * 1024;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowOrigin = allowed.length === 0 ? "*" : allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function fail(req: Request, status: number, code: string): Response {
  return new Response(JSON.stringify({ proxy_error: code }), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed");

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return fail(req, 401, "not_signed_in");

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return fail(req, 401, "not_signed_in");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
  if (profile?.role !== "teacher") return fail(req, 403, "not_teacher");

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return fail(req, 500, "missing_gemini_key");

  const length = Number(req.headers.get("Content-Length") ?? "0");
  if (length > MAX_BODY_BYTES) return fail(req, 413, "too_large");

  let body: { model?: unknown; payload?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(req, 400, "bad_json");
  }
  const model = typeof body.model === "string" ? body.model : "";
  if (!MODEL_PATTERN.test(model)) return fail(req, 400, "bad_model");
  if (!body.payload || typeof body.payload !== "object") return fail(req, 400, "bad_payload");

  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body.payload),
  });
  // Chuyển nguyên mã lỗi (429, 503, 404...) để trang web xử lý thử lại / đổi model như cũ.
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
});
