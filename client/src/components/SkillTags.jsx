// 기술 태그 목록 표시. isRequired가 있으면 필수(진하게) / 선택(연하게)으로 구분한다
export default function SkillTags({ skills, emptyText = '없음' }) {
  if (!skills || skills.length === 0) return <span className="muted">{emptyText}</span>;
  return (
    <span className="skill-tags">
      {skills.map((skill) => (
        <span
          key={skill.skillId}
          className={skill.isRequired === false ? 'skill-tag optional' : 'skill-tag'}
          title={skill.isRequired === undefined ? undefined : skill.isRequired ? '필수' : '선택'}
        >
          {skill.name}
        </span>
      ))}
    </span>
  );
}
