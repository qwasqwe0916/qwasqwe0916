import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// 메인 화면. 게시글 목록은 ② 게시글 CRUD 단계에서 추가한다.
export default function HomePage() {
  const { profile } = useAuth();

  return (
    <div className="card">
      <h1>모집 게시판</h1>
      {profile ? (
        <p>
          <strong>{profile.name}</strong>님, 환영합니다.
          {profile.department && <span className="muted"> ({profile.department})</span>}
        </p>
      ) : (
        <p className="muted">
          글을 쓰거나 지원하려면 <Link to="/login">로그인</Link>해 주세요.
        </p>
      )}
      <p className="muted">게시글 목록은 다음 단계에서 추가됩니다.</p>
    </div>
  );
}
