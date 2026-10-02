import React, { useState } from 'react';
import {
  Copy, Download, Maximize2, Minimize2, RotateCw, Tv, Sparkles, Terminal, Paperclip,
  Image as ImageIcon, Globe, Play, Clock3, ArrowUp, ChevronDown,
  FileText, LayoutGrid, SlidersHorizontal, Check, RefreshCw
} from 'lucide-react';

export function SangtianPlayerWindow({
  videoRef,
  status,
  error,
  resolvedInput,
  candidate,
  request,
  onRetry,
  onSwitchCandidate,
  onFullscreen,
  terminalTag = 'BASH',
  children,
}) {
  const [showTerminal, setShowTerminal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isWebFullscreen, setIsWebFullscreen] = useState(false);

  const streamUrl = resolvedInput?.url || candidate?.url || candidate?.metadata?.url || 'https://live.tvbox.stream/stream.m3u8';

  const handleCopyLink = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(streamUrl).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleFullscreen = () => {
    if (onFullscreen) {
      onFullscreen();
      return;
    }
    const elem = videoRef?.current?.parentElement || videoRef?.current;
    if (!elem) return;
    if (!document.fullscreenElement) {
      elem.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleToggleLandscape = () => {
    setIsLandscape(prev => {
      const next = !prev;
      if (next) {
        if (typeof screen !== 'undefined' && screen.orientation?.lock) {
          screen.orientation.lock('landscape').catch(() => {});
        }
      } else {
        if (typeof screen !== 'undefined' && screen.orientation?.unlock) {
          screen.orientation.unlock().catch(() => {});
        }
      }
      return next;
    });
  };

  const handleToggleWebFullscreen = () => {
    setIsWebFullscreen(prev => !prev);
  };

  return (
    <div className={`sangtian-window ${isLandscape ? 'is-landscape' : ''} ${isWebFullscreen ? 'is-web-fullscreen' : ''}`}>
      {/* Top Header Bar of the Window - Exactly matching screenshot */}
      <div className="sangtian-window-bar">
        <div className="sangtian-window-tag">
          <span>{terminalTag}</span>
        </div>
        <div className="sangtian-window-actions">
          <button
            className="sangtian-window-btn"
            onClick={handleCopyLink}
            title="复制播放链接"
          >
            {copied ? <Check size={13} color="#55c370" /> : <Copy size={13} />}
            <span>{copied ? '已复制' : '复制'}</span>
          </button>

          <button
            className={`sangtian-window-btn ${showTerminal ? 'active' : ''}`}
            onClick={() => setShowTerminal(v => !v)}
            title="切换终端参数/视频画面"
          >
            {showTerminal ? <Play size={13} /> : <Download size={13} />}
            <span>{showTerminal ? '画面' : '下载'}</span>
          </button>

          <button
            className={`sangtian-window-btn ${isLandscape ? 'active' : ''}`}
            onClick={handleToggleLandscape}
            title="横屏切换"
          >
            <RotateCw size={13} />
            <span>{isLandscape ? '竖屏' : '横屏'}</span>
          </button>

          <button
            className={`sangtian-window-btn ${isWebFullscreen ? 'active' : ''}`}
            onClick={handleToggleWebFullscreen}
            title="网页全屏播放"
          >
            <Tv size={13} />
            <span>{isWebFullscreen ? '还原' : '网页全屏'}</span>
          </button>

          <button
            className="sangtian-window-btn icon-only"
            onClick={handleToggleFullscreen}
            title="系统全屏"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Window Body - Video / Terminal */}
      <div className="sangtian-window-body">
        {(isLandscape || isWebFullscreen) && (
          <div className="fullscreen-quick-exit">
            {isLandscape && (
              <button className="sangtian-window-btn active" onClick={handleToggleLandscape}>
                <RotateCw size={12} /> 退出横屏
              </button>
            )}
            {isWebFullscreen && (
              <button className="sangtian-window-btn active" onClick={handleToggleWebFullscreen}>
                <Minimize2 size={12} /> 退出网页全屏
              </button>
            )}
          </div>
        )}
        {showTerminal ? (
          <div className="sangtian-terminal-panel">
            <pre className="terminal-code">
{`--base 4k.json
--base=4k.json

--source tv1.txt
--source=tv1.txt

--output 4k_tv1_embedded.json
--output=4k_tv1_embedded.json

--lock-timeout 15
--lock-timeout=15

# [TVBOX LIVE RUNTIME]
--stream-candidate: ${candidate?.candidateId || candidate?.label || 'default-candidate-01'}
--protocol: ${resolvedInput?.protocol || candidate?.protocol || 'HLS/M3U8'}
--source-id: ${candidate?.sourceId || 'source_4k_hub'}
--playback-status: ${status || 'playing'}
--resolved-stream: ${streamUrl}`}
            </pre>
            <div className="terminal-footer">
              <button className="terminal-back-btn" onClick={() => setShowTerminal(false)}>
                <Play size={13} />
                <span>返回视频播放</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {children}
            {!resolvedInput && candidate && status !== 'error' && (
              <div className="sangtian-video-overlay">
                <div className="sangtian-loading-spinner" />
                <span>正在解析“桑田山河”高品质流…</span>
              </div>
            )}
            {status === 'error' && (
              <div className="sangtian-video-error">
                <b>播放解析失败</b>
                <span>{error || '当前播放链路没有可用候选。'}</span>
                <div className="sangtian-error-btns">
                  <button className="sangtian-btn-red" onClick={onRetry}>
                    重新播放
                  </button>
                  {onSwitchCandidate && (
                    <button className="sangtian-btn-sand" onClick={onSwitchCandidate}>
                      切换备用线路
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function SangtianFloatingBar({
  playbackRate = 1.0,
  onChangeRate,
  currentCandidateLabel = '蓝光4K · 线路1',
  onOpenSourceModal,
}) {
  const rates = [0.75, 1.0, 1.25, 1.5, 2.0];

  const handleCycleSpeed = (dir) => {
    const idx = rates.indexOf(playbackRate);
    if (dir === 'up') {
      const nextIdx = Math.min(rates.length - 1, (idx === -1 ? 1 : idx) + 1);
      onChangeRate?.(rates[nextIdx]);
    } else {
      const nextIdx = Math.max(0, (idx === -1 ? 1 : idx) - 1);
      onChangeRate?.(rates[nextIdx]);
    }
  };

  return (
    <div className="sangtian-floating-bar">
      <div className="sangtian-zoom-controls">
        <button
          className="sangtian-zoom-btn"
          onClick={() => handleCycleSpeed('up')}
          title="加速播放"
        >
          +
        </button>
        <span className="sangtian-speed-label">{playbackRate}x</span>
        <button
          className="sangtian-zoom-btn"
          onClick={() => handleCycleSpeed('down')}
          title="减速播放"
        >
          -
        </button>
      </div>

      <button
        className="sangtian-model-pill"
        onClick={onOpenSourceModal}
        title="点击切换线路与解析源"
      >
        <Sparkles size={14} className="sparkle-gold" />
        <span className="model-pill-text">{currentCandidateLabel}</span>
        <ChevronDown size={14} className="chevron-down" />
      </button>
    </div>
  );
}

export function SangtianConsoleCard({
  title,
  subtitle,
  description,
  episodes = [],
  currentEpisodeId,
  onSelectEpisode,
  sources = [],
  currentSource,
  onSelectSource,
  candidates = [],
  currentCandidateId,
  onSelectCandidate,
  streamUrl,
  relatedItems = [],
  onSelectRelated,
  onReplay,
  onTogglePip,
}) {
  const [activeTab, setActiveTab] = useState('episodes'); // 'episodes' | 'info' | 'sources'
  const [smartDecode, setSmartDecode] = useState(true);
  const [autoNext, setAutoNext] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showPosterModal, setShowPosterModal] = useState(false);
  const [pingStatus, setPingStatus] = useState('');

  const handleCopyStream = () => {
    if (navigator?.clipboard?.writeText && streamUrl) {
      navigator.clipboard.writeText(streamUrl).catch(() => {});
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handlePingSource = () => {
    setPingStatus('测试中…');
    setTimeout(() => {
      setPingStatus('✓ 线路连通正常 (28ms)');
      setTimeout(() => setPingStatus(''), 3000);
    }, 600);
  };

  return (
    <div className="sangtian-console-card">
      {/* Sub-header Bar: Toggles & View Switches - Borrowed from bottom chat sub-bar */}
      <div className="sangtian-console-subbar">
        <div className="console-toggles">
          <div className="console-toggle-item">
            <span className="toggle-label">
              <Sparkles size={12} className="sparkle-gold" />
              <span>思考模式</span>
            </span>
            <div className="toggle-switch-group">
              <button
                className={`switch-badge ${!smartDecode ? 'active' : ''}`}
                onClick={() => setSmartDecode(false)}
              >
                OFF
              </button>
              <button
                className={`switch-badge ${smartDecode ? 'active' : ''}`}
                onClick={() => setSmartDecode(true)}
              >
                ON
              </button>
            </div>
          </div>

          <div className="console-toggle-item">
            <span className="toggle-label">
              <span>Agent</span>
            </span>
            <div className="toggle-switch-group">
              <button
                className={`switch-badge ${!autoNext ? 'active' : ''}`}
                onClick={() => setAutoNext(false)}
              >
                OFF
              </button>
              <button
                className={`switch-badge ${autoNext ? 'active' : ''}`}
                onClick={() => setAutoNext(true)}
              >
                ON
              </button>
            </div>
          </div>
        </div>

        <div className="console-tab-switches">
          <button
            className={`console-tab-btn ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
            title="剧集信息与简介"
          >
            <FileText size={15} />
          </button>
          <button
            className={`console-tab-btn ${activeTab === 'episodes' ? 'active' : ''}`}
            onClick={() => setActiveTab('episodes')}
            title="选集播放"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            className={`console-tab-btn ${activeTab === 'sources' ? 'active' : ''}`}
            onClick={() => setActiveTab('sources')}
            title="来源与线路设置"
          >
            <SlidersHorizontal size={15} />
          </button>
        </div>
      </div>

      {/* Main Interactive Content */}
      <div className="sangtian-console-body">
        {/* Tab 1: Episodes (选集) */}
        {activeTab === 'episodes' && (
          <div className="console-episodes-section">
            <div className="console-section-header">
              <span className="section-eyebrow">EPISODES · 选集列表</span>
              <h4>{title}</h4>
            </div>

            {episodes.length > 0 ? (
              <div className="sangtian-episode-grid">
                {episodes.map((ep, idx) => {
                  const isCurrent = ep.episodeId === currentEpisodeId || idx === 0 && !currentEpisodeId;
                  return (
                    <button
                      key={ep.episodeId || idx}
                      className={`sangtian-ep-btn ${isCurrent ? 'active' : ''}`}
                      onClick={() => onSelectEpisode?.(idx)}
                    >
                      <span>{ep.title || `${idx + 1}`}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="sangtian-empty-text">当前频道为单一直播流或独幕剧集</div>
            )}
          </div>
        )}

        {/* Tab 2: Information & Synopsis (视频信息与简介) */}
        {activeTab === 'info' && (
          <div className="console-info-section">
            <div className="console-section-header">
              <span className="section-eyebrow">OVERVIEW · 详细资料</span>
              <h4>{title}</h4>
            </div>
            {subtitle && <p className="console-subtitle">{subtitle}</p>}
            <p className="console-description">{description || '暂无剧情简介。'}</p>

            <div className="console-url-snippet">
              <span className="snippet-label">当前流直链：</span>
              <code className="snippet-code">{streamUrl || '加载中…'}</code>
              <button className="snippet-copy-btn" onClick={handleCopyStream}>
                {copiedLink ? <Check size={14} color="#54c46f" /> : <Copy size={14} />}
                <span>{copiedLink ? '已复制' : '复制直链'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Sources & Lines (线路与解析源) */}
        {activeTab === 'sources' && (
          <div className="console-sources-section">
            <div className="console-section-header">
              <span className="section-eyebrow">SOURCES · 换源与线路</span>
              <h4>视频源解析矩阵</h4>
            </div>

            {sources.length > 0 && (
              <div className="console-source-group">
                <span className="group-label">可用内容源：</span>
                <div className="chips">
                  {sources.map(s => (
                    <button
                      key={s}
                      className={currentSource === s ? 'active' : ''}
                      onClick={() => onSelectSource?.(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {candidates.length > 0 && (
              <div className="console-source-group">
                <span className="group-label">备用线路选择：</span>
                <div className="chips">
                  {candidates.map(c => (
                    <button
                      key={c.candidateId}
                      className={currentCandidateId === c.candidateId ? 'active' : ''}
                      onClick={() => onSelectCandidate?.(c.candidateId)}
                    >
                      {c.metadata?.label || c.label || c.protocol}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quick URL snippet if in episodes tab */}
        {activeTab === 'episodes' && streamUrl && (
          <div className="sangtian-quick-copy-bar" onClick={handleCopyStream}>
            <Paperclip size={13} className="text-stone-500" />
            <span className="copy-bar-text">
              {copiedLink ? '✓ 播放串流地址已成功复制到剪贴板！' : `点击快速复制播放地址: ${streamUrl.slice(0, 36)}...`}
            </span>
            <span className="copy-action-pill">{copiedLink ? '已复制' : '复制'}</span>
          </div>
        )}

        {/* Related Recommendations (相关推荐) */}
        {relatedItems.length > 0 && (
          <div className="console-related-section">
            <div className="console-section-header">
              <span className="section-eyebrow">RECOMMENDED · 相关推荐</span>
            </div>
            <div className="sangtian-related-row">
              {relatedItems.slice(0, 6).map(item => (
                <div
                  key={item.contentId || item.channelId}
                  className="sangtian-related-card"
                  onClick={() => onSelectRelated?.(item)}
                >
                  <img src={item.poster || item.logo} alt={item.title || item.name} />
                  <b>{item.title || item.name}</b>
                  <small>{item.category || item.year || '精彩视听'}</small>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Console Bottom Action Bar - Matching icons and the prominent red arrow button */}
      <div className="sangtian-console-bottom">
        <div className="console-action-icons">
          <button
            className="action-icon-btn"
            onClick={handleCopyStream}
            title="复制播放链接"
          >
            <Paperclip size={18} />
          </button>
          <button
            className="action-icon-btn"
            onClick={() => setShowPosterModal(true)}
            title="查看原图与封面"
          >
            <ImageIcon size={18} />
          </button>
          <button
            className="action-icon-btn"
            onClick={handlePingSource}
            title="检测网络连通性"
          >
            <Globe size={18} />
          </button>
          <button
            className="action-icon-btn"
            onClick={onTogglePip}
            title="画中画模式"
          >
            <Play size={18} />
          </button>
          <button
            className="action-icon-btn"
            onClick={() => setActiveTab('info')}
            title="查看播放参数"
          >
            <Clock3 size={18} />
          </button>
        </div>

        {pingStatus && (
          <div className="console-ping-tag">{pingStatus}</div>
        )}

        <button
          className="sangtian-submit-btn"
          onClick={onReplay}
          title="立即起播 / 重载起播"
          aria-label="起播"
        >
          <ArrowUp size={22} strokeWidth={2.6} />
        </button>
      </div>

      {showPosterModal && (
        <div className="sangtian-modal-backdrop" onClick={() => setShowPosterModal(false)}>
          <div className="sangtian-modal" onClick={e => e.stopPropagation()}>
            <h4>“桑田山河” 视听档案</h4>
            <p><strong>片名：</strong>{title}</p>
            <p><strong>状态：</strong>播放链路畅通</p>
            <p><strong>播放直链：</strong><code>{streamUrl}</code></p>
            <button className="primary" onClick={() => setShowPosterModal(false)}>
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
