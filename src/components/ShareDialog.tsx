import { useEffect, useRef, useState } from 'react';
import { Close } from './Icons';

interface ShareDialogProps {
  open: boolean;
  url: string;
  onClose: () => void;
}

export default function ShareDialog({ open, url, onClose }: ShareDialogProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      return;
    }
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [open, onClose]);

  if (!open) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      inputRef.current?.select();
      document.execCommand?.('copy');
      setCopied(true);
    }
  }

  return (
    <div className="share-mask" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="share-card" onClick={(event) => event.stopPropagation()}>
        <div className="share-head">
          <strong>把这条链接发给别人</strong>
          <button type="button" className="icon-button tiny" onClick={onClose} aria-label="关闭">
            <Close size={14} />
          </button>
        </div>

        <p className="share-tip">
          行程本身存在你电脑的浏览器里，所以链接得带上地址里那串参数，对方才看得到同一份行程。
        </p>

        <textarea
          ref={inputRef}
          className="share-url"
          readOnly
          value={url}
          rows={4}
          onFocus={(event) => event.currentTarget.select()}
        />

        <div className="share-actions">
          <span className="share-meta">{url.length} 字符</span>
          <div className="share-buttons">
            <a className="text-button" href={url} target="_blank" rel="noreferrer">
              新窗口预览
            </a>
            <button type="button" className="primary-button" onClick={copy}>
              {copied ? '已复制' : '复制链接'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
