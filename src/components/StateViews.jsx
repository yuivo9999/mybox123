import React from 'react';
import { AlertCircle, ImageOff, LoaderCircle } from 'lucide-react';
export function LoadingState({ text = '正在加载…', compact = false }) {
  return <div className={compact ? 'empty compact state-view' : 'empty state-view'}><LoaderCircle className="spin" size={22} /><span>{text}</span></div>;
}
export function EmptyState({ text = '暂无数据', icon: Icon = ImageOff }) {
  return <div className="empty state-view"><Icon size={22} /><span>{text}</span></div>;
}
export function ErrorState({ text = '加载失败', retry, actionText = '重新加载' }) {
  return <div className="empty state-view error-state"><AlertCircle size={22} /><span>{text}</span>{retry && <button className="secondary" onClick={retry}>{actionText}</button>}</div>;
}
export function SmartImage({ src, alt = '', fallback = null, ...props }) {
  const [state, setState] = React.useState(src ? 'loading' : 'error');
  React.useEffect(() => setState(src ? 'loading' : 'error'), [src]);
  if (state === 'error') return fallback ?? <div className="image-placeholder" aria-label={alt}><ImageOff size={20} /></div>;
  return <img {...props} src={src} alt={alt} onLoad={() => setState('loaded')} onError={() => setState('error')} />;
}
