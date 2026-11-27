import { useEffect, useState } from 'react';
import { Close } from './Icons';
import {
  fetchRemoteTrip,
  pushTripToRepo,
  readCloudConfig,
  saveCloudConfig,
  type CloudConfig,
  type CloudTrip,
} from '../state/cloud';
import {
  readAutoSaveEnabled,
  writeAutoSaveEnabled,
  tripFingerprint,
} from '../state/persistence';
import type { TripSnapshot } from '../state/tripReducer';

interface SyncDialogProps {
  open: boolean;
  snapshot: TripSnapshot;
  onClose: () => void;
  onLoaded: (trip: CloudTrip) => void;
  /** 手动保存成功后通知主页面，刷新同步状态、避免重复自动提交。 */
  onSynced: (fingerprint: string) => void;
  onResetKey: () => void;
}

export default function SyncDialog({
  open,
  snapshot,
  onClose,
  onLoaded,
  onSynced,
  onResetKey,
}: SyncDialogProps) {
  const [config, setConfig] = useState<CloudConfig>(readCloudConfig);
  const [autoSave, setAutoSave] = useState(readAutoSaveEnabled);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'load' | null>(null);

  useEffect(() => {
    if (!open) {
      setStatus(null);
      setBusy(null);
    }
  }, [open]);

  if (!open) return null;

  function update(patch: Partial<CloudConfig>) {
    const next = { ...config, ...patch };
    setConfig(next);
    saveCloudConfig(next);
  }

  async function handleSave() {
    setBusy('save');
    setStatus('正在写入 GitHub…');
    try {
      await pushTripToRepo(config, snapshot);
      onSynced(tripFingerprint(snapshot));
      setStatus('已写入仓库，其他设备打开或切回页面时会自动更新');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '写入失败');
    } finally {
      setBusy(null);
    }
  }

  async function handleLoad() {
    setBusy('load');
    setStatus('正在读取…');
    try {
      const trip = await fetchRemoteTrip(config);
      if (!trip) {
        setStatus('仓库里还没有 trip.json');
        return;
      }
      onLoaded(trip);
      setStatus('已从仓库覆盖到当前页面');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '读取失败');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="share-mask" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="share-card sync-card" onClick={(event) => event.stopPropagation()}>
        <div className="share-head">
          <strong>设置</strong>
          <button type="button" className="icon-button tiny" onClick={onClose} aria-label="关闭">
            <Close size={14} />
          </button>
        </div>

        <section className="sync-block">
          <h3>同步到 GitHub（换设备、发给别人都能看到）</h3>
          <p className="share-tip">
            行程会写进仓库的 <code>{config.path}</code>，网站打开时自动读取。
            需要一个 GitHub Token（Fine-grained，只给它这个仓库的 Contents 读写权限），
            只存在这台电脑的浏览器里。
          </p>

          <label className="sync-field">
            <span>GitHub Token</span>
            <input
              type="password"
              value={config.token}
              placeholder="github_pat_..."
              onChange={(event) => update({ token: event.target.value.trim() })}
            />
          </label>

          <div className="sync-row">
            <label className="sync-field">
              <span>仓库</span>
              <input
                value={`${config.owner}/${config.repo}`}
                onChange={(event) => {
                  const [owner, repo] = event.target.value.split('/');
                  update({ owner: owner?.trim() ?? '', repo: repo?.trim() ?? '' });
                }}
              />
            </label>
            <label className="sync-field">
              <span>分支</span>
              <input value={config.branch} onChange={(event) => update({ branch: event.target.value.trim() })} />
            </label>
          </div>

          <label className="sync-field sync-check">
            <input
              type="checkbox"
              checked={autoSave}
              onChange={(event) => {
                setAutoSave(event.target.checked);
                writeAutoSaveEnabled(event.target.checked);
              }}
            />
            <span>改动后自动保存到仓库（仅填了 Token 的设备生效）</span>
          </label>
          <p className="share-tip">
            所有设备打开或切回页面时，会自动采用仓库里更新的版本；
            没填 Token 的设备只读不写。两端同时改动时，以最后保存的为准。
          </p>

          <div className="sync-buttons">
            <button type="button" className="primary-button" onClick={handleSave} disabled={busy !== null}>
              {busy === 'save' ? '写入中…' : '保存到仓库'}
            </button>
            <button type="button" className="text-button" onClick={handleLoad} disabled={busy !== null}>
              {busy === 'load' ? '读取中…' : '从仓库读回来'}
            </button>
          </div>

          {status ? <p className="sync-status">{status}</p> : null}
        </section>

        <section className="sync-block">
          <h3>地图 Key</h3>
          <p className="share-tip">当前使用网站自带的 Key；换自己的 Key 会清掉本机设置。</p>
          <button type="button" className="text-button" onClick={onResetKey}>
            重新配置 Key
          </button>
        </section>
      </div>
    </div>
  );
}
