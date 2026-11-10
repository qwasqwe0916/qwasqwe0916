// 보유 기술 선택 (눌러서 선택 / 해제)
export default function SkillPicker({ skills, selectedIds, onChange }) {
  function toggle(skillId) {
    onChange(selectedIds.includes(skillId) ? selectedIds.filter((id) => id !== skillId) : [...selectedIds, skillId]);
  }
  return (
    <div className="chip-group">
      {skills.map((skill) => (
        <button
          type="button"
          key={skill.skillId}
          className={selectedIds.includes(skill.skillId) ? 'chip selected' : 'chip'}
          onClick={() => toggle(skill.skillId)}
        >
          {skill.name}
        </button>
      ))}
    </div>
  );
}
