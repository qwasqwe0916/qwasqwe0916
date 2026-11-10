// 게시글 요구 기술 선택. 누를 때마다 선택 안 함 → 필수 → 선택 → 선택 안 함 순서로 바뀐다
export default function PostSkillPicker({ skills, value, onChange }) {
  function cycle(skillId) {
    const current = value.find((item) => item.skillId === skillId);
    const others = value.filter((item) => item.skillId !== skillId);
    if (!current) onChange([...others, { skillId, isRequired: true }]);
    else if (current.isRequired) onChange([...others, { skillId, isRequired: false }]);
    else onChange(others);
  }
  return (
    <>
      <p className="muted small hint">
        한 번 누르면 <span className="chip-legend required">필수</span>, 두 번 누르면{' '}
        <span className="chip-legend optional">선택</span>, 세 번 누르면 해제됩니다.
      </p>
      <div className="chip-group">
        {skills.map((skill) => {
          const current = value.find((item) => item.skillId === skill.skillId);
          const className = !current ? 'chip' : current.isRequired ? 'chip selected' : 'chip selected optional';
          return (
            <button type="button" key={skill.skillId} className={className} onClick={() => cycle(skill.skillId)}>
              {skill.name}
              {current && <small>{current.isRequired ? ' 필수' : ' 선택'}</small>}
            </button>
          );
        })}
      </div>
    </>
  );
}
