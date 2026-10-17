/** 攻撃力（赤）と体力（青）。hurt なら体力の数字を目立たせる */
export function Stats({ attack, hp, hurt = false }: { attack: number; hp: number; hurt?: boolean }) {
  return (
    <span className="stats">
      <span className="stat stat-atk" title="攻撃力">
        <small>攻撃</small>
        <b>{attack}</b>
      </span>
      <span className={`stat stat-hp ${hurt ? "hurt" : ""}`} title="体力">
        <small>体力</small>
        <b>{hp}</b>
      </span>
    </span>
  );
}
