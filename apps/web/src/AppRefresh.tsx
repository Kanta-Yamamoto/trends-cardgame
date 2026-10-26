import { useUpdateReady } from "./pwa";

/** 新しい版が出ているときの帯（押すと切り替わる。対戦中に勝手に読み直さない） */
export function UpdateBar() {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <div className="update-bar" role="status">
      <span>新しい版があります</span>
      <button type="button" className="btn small" onClick={() => window.location.reload()}>
        更新する
      </button>
    </div>
  );
}
