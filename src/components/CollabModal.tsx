import type { CollabMember, CollabStatus } from '../collab/useCollab';
import { Close, Copy, LogOut, Users } from './Icons';

interface CollabModalProps {
  open: boolean;
  roomId: string | null;
  inviteUrl: string;
  status: CollabStatus;
  members: CollabMember[];
  clientId: string;
  name: string;
  onClose: () => void;
  onCreate: () => void;
  onCopy: () => void;
  onLeave: () => void;
}

const STATUS_LABEL: Record<CollabStatus, string> = {
  off: '未开启',
  connecting: '正在连接协作服务…',
  online: '实时同步中',
  error: '协作服务未连接',
};

export default function CollabModal({
  open,
  roomId,
  inviteUrl,
  status,
  members,
  clientId,
  name,
  onClose,
  onCreate,
  onCopy,
  onLeave,
}: CollabModalProps) {
  if (!open) return null;

  return (
    <div className="collab-overlay" onMouseDown={onClose}>
      <section
        className="collab-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="实时协作"
      >
        <button
          type="button"
          className="icon-button collab-close"
          onClick={onClose}
          aria-label="关闭"
        >
          <Close size={16} />
        </button>

        {!roomId ? (
          <>
            <p className="panel-eyebrow">
              <Users size={14} />
              REAL-TIME WORKSPACE
            </p>
            <h2>一起规划这份行程。</h2>
            <p className="collab-copy">
              创建一个协作房间，把邀请链接发给同行的人。大家能实时看到彼此的标点、顺序、天数和出行方式。
            </p>

            <ul className="collab-points">
              <li>标点、天数、顺序、出行方式实时同步</li>
              <li>每个人仍可以在自己的地图上查看路线</li>
              <li>拿到邀请链接的人都能进入并编辑，请只发给同行的人</li>
            </ul>

            <div className="collab-identity">
              你会以 <strong>{name}</strong> 的身份加入
            </div>

            <button type="button" className="primary-button" onClick={onCreate}>
              <Users size={17} />
              创建协作房间
            </button>
          </>
        ) : (
          <>
            <p className="panel-eyebrow">
              <span className={`collab-live-dot ${status}`} />
              LIVE SESSION
            </p>
            <h2>协作房间已开启。</h2>

            <div className={`collab-status-row ${status}`}>
              <span>{STATUS_LABEL[status]}</span>
              <span>{members.length} 人在线</span>
            </div>

            {status === 'error' ? (
              <p className="collab-error">
                连不上协作服务。检查服务端是否启动，或部署平台是否允许 WebSocket。
              </p>
            ) : null}

            <label className="collab-link-label" htmlFor="collab-invite">
              邀请链接
            </label>
            <div className="collab-link-row">
              <input id="collab-invite" readOnly value={inviteUrl} />
              <button type="button" className="copy-button" onClick={onCopy}>
                <Copy size={14} />
                复制
              </button>
            </div>

            <div className="collab-members">
              {members.length ? (
                members.map((member) => (
                  <span className="collab-member" key={member.id}>
                    <i
                      style={{ background: member.color }}
                      aria-hidden="true"
                    />
                    {member.name}
                    {member.id === clientId ? '（你）' : ''}
                  </span>
                ))
              ) : (
                <span className="collab-member muted">正在等待成员…</span>
              )}
            </div>

            <div className="collab-actions">
              <button
                type="button"
                className="primary-button compact"
                onClick={onCopy}
              >
                <Copy size={15} />
                复制邀请链接
              </button>
              <button type="button" className="text-button" onClick={onLeave}>
                <LogOut size={14} />
                退出协作
              </button>
            </div>

            <p className="collab-note">
              房间状态保存在服务端；路线结果只在本机计算，不会上传。
            </p>
          </>
        )}
      </section>
    </div>
  );
}
