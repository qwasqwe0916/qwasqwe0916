import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const options = { auth: { persistSession: false, autoRefreshToken: false } };

// 로그인 토큰 검증용 (공개 키)
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, options);

// 회원 탈퇴 시 로그인 계정 삭제용 (관리자 키). 서버에서만 사용하며 화면에는 절대 넣지 않는다.
export const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, options)
  : null;
