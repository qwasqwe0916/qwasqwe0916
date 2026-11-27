import { supabase } from './supabase';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// 서버 API 호출. 로그인 상태라면 토큰을 자동으로 붙인다.
async function request(path, { method = 'GET', body } = {}) {
  const { data } = await supabase.auth.getSession();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;

  let res;
  try {
    res = await fetch(BASE_URL + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.');
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(json?.message ?? `요청에 실패했습니다. (${res.status})`);
    error.status = res.status;
    error.code = json?.code;
    throw error;
  }
  return json;
}

// 파일 내려받기 (토큰이 필요한 CSV 등)
async function download(path, filename) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(BASE_URL + path, {
    headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {},
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(json?.message ?? `내려받기에 실패했습니다. (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const api = {
  download,
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
