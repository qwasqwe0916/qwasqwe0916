import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { AuthContext } from './AuthContext';

// 로그인 상태(session)와 MySQL 프로필(profile)을 앱 전체에 제공한다.
export function AuthProvider({ children }) {
  // undefined: 확인 중, null: 로그인 안 함
  const [session, setSession] = useState(undefined);
  // 어떤 사용자의 프로필인지 함께 저장해서, 계정이 바뀌면 다시 불러온다
  const [profileState, setProfileState] = useState({ userId: null, profile: null, error: null });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api
      .get('/api/me')
      .then((profile) => {
        if (!cancelled) setProfileState({ userId, profile, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        // 404: 아직 프로필이 없음 (첫 로그인) → 프로필 설정 화면으로
        setProfileState({ userId, profile: null, error: error.status === 404 ? null : error });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const isCurrent = userId !== null && profileState.userId === userId;

  const setProfile = useCallback(
    (profile) => setProfileState({ userId, profile, error: null }),
    [userId]
  );

  const signOut = useCallback((options) => supabase.auth.signOut(options), []);

  const value = useMemo(
    () => ({
      session,
      loading: session === undefined || (userId !== null && !isCurrent),
      profile: isCurrent ? profileState.profile : null,
      profileError: isCurrent ? profileState.error : null,
      setProfile,
      signOut,
    }),
    [session, userId, isCurrent, profileState, setProfile, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
