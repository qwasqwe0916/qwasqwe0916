import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// 서버는 로그인 토큰을 검증하는 용도로만 Supabase를 사용한다.
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
