import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';
import ProfileFormPage from './pages/ProfileFormPage';
import ProfilePage from './pages/ProfilePage';
import PostListPage from './pages/PostListPage';
import PostDetailPage from './pages/PostDetailPage';
import PostFormPage from './pages/PostFormPage';
import AuthorProfilePage from './pages/AuthorProfilePage';
import MyPage from './pages/MyPage';
import TeamPage from './pages/TeamPage';

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
            {profile && <Link to="/mypage">마이페이지</Link>}
            {profile && <Link to="/profile">프로필</Link>}
            <button type="button" className="link" onClick={() => signOut()}>
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
        <Route path="/" element={<PostListPage />} />
        <Route path="/posts/new" element={session ? <PostFormPage /> : <Navigate to="/login" replace />} />
        <Route path="/posts/:id" element={<PostDetailPage />} />
        <Route path="/posts/:id/author" element={<AuthorProfilePage kind="posts" />} />
        <Route path="/comments/:id/author" element={<AuthorProfilePage kind="comments" />} />
        <Route
          path="/applications/:id/applicant"
          element={session ? <AuthorProfilePage kind="applications" /> : <Navigate to="/login" replace />}
        />
        <Route path="/posts/:id/team" element={session ? <TeamPage /> : <Navigate to="/login" replace />} />
        <Route path="/posts/:id/edit" element={session ? <PostFormPage key="edit" /> : <Navigate to="/login" replace />} />
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/mypage" element={session ? <MyPage /> : <Navigate to="/login" replace />} />
        <Route
          path="/profile/setup"
          element={
            !session ? <Navigate to="/login" replace /> : profile ? <Navigate to="/" replace /> : <ProfileFormPage />
          }
        />
        <Route
          path="/profile"
          element={session ? <ProfilePage /> : <Navigate to="/login" replace />}
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
