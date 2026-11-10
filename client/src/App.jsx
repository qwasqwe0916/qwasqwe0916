import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import ProfileFormPage from './pages/ProfileFormPage';

function Header() {
  const { session, profile, signOut } = useAuth();
  return (
    <header className="header">
      <Link to="/" className="logo">
        Campus Teammate Matcher
      </Link>
      <nav>
        {session ? (
          <>
            {profile && <Link to="/profile/edit">{profile.name}</Link>}
            <button type="button" className="link" onClick={signOut}>
              로그아웃
            </button>
          </>
        ) : (
          <Link to="/login">로그인</Link>
        )}
      </nav>
    </header>
  );
}

export default function App() {
  const { session, loading, profile, profileError } = useAuth();
  const { pathname } = useLocation();

  let content;
  if (loading) {
    content = <p className="muted center">불러오는 중…</p>;
  } else if (profileError) {
    content = (
      <div className="card narrow">
        <p className="error">{profileError.message}</p>
        <button type="button" onClick={() => window.location.reload()}>
          다시 시도
        </button>
      </div>
    );
  } else if (session && !profile && pathname !== '/profile/setup') {
    // 로그인했지만 프로필이 없으면 먼저 프로필을 등록하게 한다
    content = <Navigate to="/profile/setup" replace />;
  } else {
    content = (
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route
          path="/profile/setup"
          element={
            !session ? <Navigate to="/login" replace /> : profile ? <Navigate to="/" replace /> : <ProfileFormPage mode="create" />
          }
        />
        <Route
          path="/profile/edit"
          element={session ? <ProfileFormPage mode="edit" /> : <Navigate to="/login" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <Header />
      <main className="main">{content}</main>
    </>
  );
}
