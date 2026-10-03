import React, { useState } from 'react';
import {
  Copy, Download, Maximize2, Minimize2, RotateCw, Tv, Sparkles, Terminal, Paperclip,
  Play, Clock3, ArrowUp, ChevronDown,
  FileText, LayoutGrid, SlidersHorizontal, Check, RefreshCw, Ratio
} from 'lucide-react';

export function SangtianPlayerWindow({
  videoRef, status, error, resolvedInput, candidate, request, onRetry, onSwitchCandidate,
  onFullscreen, terminalTag = 'BASH', children, videoContainerRef, isLive = false,
  playbackRate = 1.0, onChangePlaybackRate,
}) {
  const [showTerminal, setShowTerminal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isWebFullscreen, setIsWebFullscreen] = useState(false);
  const [isSystemFullscreen, setIsSystemFullscreen] = useState(false);
  const [aspectMode, setAspectMode] = useState('original');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedSeconds, setBufferedSeconds] = useState(0);
  const [bufferRate, setBufferRate] = useState(0);
  const [networkDownlink, setNetworkDownlink] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showFullscreenBar, setShowFullscreenBar] = useState(true);
  const lastBufferRef = React.useRef({time: 0, buffered: 0});

  const streamUrl = resolvedInput?.url || candidate?.mediaUrl || candidate?.url || candidate?.metadata?.url || '';
  const aspectOptions = [
    { id: 'original', label: '原始', title: '保持视频源比例' },
    { id: '16:9', label: '16:9', title: '16:9' },
    { id: '4:3', label: '4:3', title: '4:3' },
    { id: 'fill', label: '铺满', title: '铺满画面（可能裁切）' },
  ];
  const currentAspect = aspectOptions.find(item => item.id === aspectMode) || aspectOptions[0];

  const formatTime = value => {
    if (!Number.isFinite(value)) return '00:00';
    const total = Math.max(0, Math.floor(value));
    return `${Math.floor(total / 3600) ? String(Math.floor(total / 3600)).padStart(2,'0') + ':' : ''}${String(Math.floor((total % 3600) / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
  };
  const syncMediaMetrics = () => {
    const video = videoRef?.current;
    if (!video) return;
    setCurrentTime(Number(video.currentTime) || 0);
    setDuration(Number(video.duration) || 0);
    let buffered = 0;
    try {
      if (video.buffered?.length) buffered = video.buffered.end(video.buffered.length - 1);
    } catch {}
    setBufferedSeconds(buffered);
    const now = performance.now();
    const previous = lastBufferRef.current;
    if (previous.time > 0 && now > previous.time && buffered >= previous.buffered) {
      setBufferRate((buffered - previous.buffered) / ((now - previous.time) / 1000));
    }
    lastBufferRef.current = {time: now, buffered};
  };

  React.useEffect(() => {
    const video = videoRef?.current;
    if (!video) return undefined;
    const events = ['timeupdate','progress','loadedmetadata','durationchange','playing','pause','waiting','canplay','seeking','seeked'];
    const update = () => { syncMediaMetrics(); setIsPlaying(!video.paused && !video.ended); };
    events.forEach(event => video.addEventListener(event, update));
    const timer = window.setInterval(update, 500);
    update();
    return () => { events.forEach(event => video.removeEventListener(event, update)); window.clearInterval(timer); };
  }, [videoRef]);

  React.useEffect(() => {
    const connection = typeof navigator !== 'undefined'
      ? (navigator.connection || navigator.mozConnection || navigator.webkitConnection)
      : null;
    const update = () => setNetworkDownlink(Number.isFinite(Number(connection?.downlink)) ? Number(connection.downlink) : null);
    update();
    connection?.addEventListener?.('change', update);
    return () => connection?.removeEventListener?.('change', update);
  }, []);

  React.useEffect(() => {
    const onFullscreen = () => setIsSystemFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    onFullscreen();
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  const handleCycleAspect = () => setAspectMode(prev => aspectOptions[(aspectOptions.findIndex(item => item.id === prev) + 1) % aspectOptions.length].id);
  const handleCopyLink = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && streamUrl) navigator.clipboard.writeText(streamUrl).catch(() => {});
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  };
  const handleToggleFullscreen = async () => {
    if (onFullscreen) { onFullscreen(); return; }
    const elem = videoRef?.current?.parentElement || videoRef?.current;
    if (!elem) return;
    if (!document.fullscreenElement) {
      try { await elem.requestFullscreen?.(); } catch {}
      try { await screen.orientation?.lock?.(isLandscape ? 'landscape' : 'portrait'); } catch {}
    } else {
      try { await document.exitFullscreen?.(); } catch {}
      try { screen.orientation?.unlock?.(); } catch {}
    }
  };
  const handleToggleLandscape = async () => {
    const next = !isLandscape;
    setIsLandscape(next);
    try { await screen.orientation?.lock?.(next ? 'landscape' : 'portrait'); } catch {}
  };
  const handleSeek = value => {
    const video = videoRef?.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Number(value);
    setCurrentTime(Number(value));
  };
  const handlePlayPause = () => {
    const video = videoRef?.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {}); else video.pause();
  };
  const fullscreen = isSystemFullscreen || isWebFullscreen;
  const bufferPct = duration > 0 ? Math.min(100, (bufferedSeconds / duration) * 100) : 0;
  const loadSpeed = bufferRate > 0 ? `${bufferRate.toFixed(1)} 秒/秒` : '—';

  return (
    <div className={`sangtian-window ${isLive ? 'is-live-direct' : ''} ${isLandscape ? 'is-landscape' : ''} ${isWebFullscreen ? 'is-web-fullscreen' : ''} ${isSystemFullscreen ? 'is-system-fullscreen' : ''} aspect-${aspectMode.replace(':','-')}`}>
      {!fullscreen && <div className="sangtian-window-bar">
        <div className="sangtian-window-tag"><span>{terminalTag}</span></div>
        <div className="sangtian-window-actions">
          <button className="sangtian-window-btn" onClick={handleCopyLink} title="复制播放链接">{copied ? <Check size={13}/> : <Copy size={13}/>}<span>{copied ? '已复制' : '复制'}</span></button>
          <button className={`sangtian-window-btn ${showTerminal ? 'active' : ''}`} onClick={() => setShowTerminal(v=>!v)} title="播放信息">{showTerminal ? <Play size={13}/> : <Download size={13}/>}<span>{showTerminal ? '画面' : '信息'}</span></button>
          <button className={`sangtian-window-btn ${isLandscape ? 'active' : ''}`} onClick={handleToggleLandscape} title="方向"><RotateCw size={13}/><span>{isLandscape ? '竖屏' : '横屏'}</span></button>
          <button className={`sangtian-window-btn ${isWebFullscreen ? 'active' : ''}`} onClick={()=>setIsWebFullscreen(v=>!v)} title="窗口全屏"><Tv size={13}/><span>{isWebFullscreen ? '还原' : '全屏'}</span></button>
          <button className={`sangtian-window-btn ${aspectMode !== 'original' ? 'active' : ''}`} onClick={handleCycleAspect} title={currentAspect.title}><Ratio size={13}/><span>{currentAspect.label}</span></button>
          <button className="sangtian-window-btn icon-only" onClick={handleToggleFullscreen} title="系统全屏"><Maximize2 size={13}/></button>
        </div>
      </div>}

      <div ref={videoContainerRef} className="sangtian-window-body">
        {showTerminal ? (
          <div className="sangtian-terminal-panel"><pre className="terminal-code">{`播放信息

模式：${isLive ? 'Live 直连' : '影视解析'}
协议：${resolvedInput?.protocol || candidate?.protocol || '未知'}
源：${candidate?.sourceId || '—'}
状态：${status || 'idle'}
播放进度：${formatTime(currentTime)} / ${formatTime(duration)}
已缓冲：${formatTime(bufferedSeconds)}
加载速率：${loadSpeed}
网络估速：${networkDownlink != null ? networkDownlink + ' Mbps' : '不可用'}
播放地址：${streamUrl || '等待地址…'}`}</pre>
            <div className="terminal-footer"><button className="terminal-back-btn" onClick={()=>setShowTerminal(false)}><Play size={13}/><span>返回视频播放</span></button></div></div>
        ) : (
          <>
            {children}
            {!resolvedInput && candidate && status !== 'error' && <div className="sangtian-video-overlay"><div className="sangtian-loading-spinner"/><span>{isLive ? '正在连接直播直链…' : '正在解析视频播放地址…'}</span></div>}
            {resolvedInput && status !== 'error' && !isPlaying && <div className="sangtian-video-overlay compact"><div className="sangtian-loading-spinner"/><span>正在缓冲…</span></div>}
            {status === 'error' && <div className="sangtian-video-error"><b>{isLive ? '直播直连失败' : '播放解析失败'}</b><span>{error || '当前播放链路没有可用候选。'}</span><div className="sangtian-error-btns"><button className="sangtian-btn-red" onClick={onRetry}>重新播放</button>{onSwitchCandidate && <button className="sangtian-btn-sand" onClick={onSwitchCandidate}>切换备用线路</button>}</div></div>}
            {fullscreen && (
              <div className={`sangtian-fullscreen-controls ${isLandscape ? 'landscape' : 'portrait'} ${showFullscreenBar ? 'visible' : ''}`}
                   onClick={()=>setShowFullscreenBar(true)}>
                <div className="sangtian-fullscreen-topbar"><span>{request?.metadata?.title || candidate?.label || '正在播放'}</span><button onClick={handleToggleFullscreen}><Minimize2 size={18}/></button></div>
                <div className="sangtian-fullscreen-center"><button onClick={handlePlayPause} className="fullscreen-play-btn">{isPlaying ? '暂停' : '播放'}</button></div>
                <div className="sangtian-fullscreen-bottombar">
                  <div className="sangtian-fullscreen-progress">
                    <span>{formatTime(currentTime)}</span>
                    <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(currentTime,duration||0)} onChange={e=>handleSeek(e.target.value)} aria-label="播放进度"/>
                    <span>{formatTime(duration)}</span>
                  </div>
                  <div className="sangtian-fullscreen-metrics"><span>缓冲 {bufferPct.toFixed(0)}%</span><span>加载 {loadSpeed}</span><span>网络 {networkDownlink != null ? networkDownlink+' Mbps' : '—'}</span></div>
                  <div className="sangtian-fullscreen-actions">
                    <button onClick={handleToggleLandscape}><RotateCw size={15}/>{isLandscape ? '竖屏' : '横屏'}</button>
                    <button onClick={handleCycleAspect}><Ratio size={15}/>{currentAspect.label}</button>
                    <button onClick={()=>{const next=playbackRate>=2?0.75:playbackRate+0.25;onChangePlaybackRate?.(Number(next.toFixed(2)));}}><Clock3 size={15}/>{playbackRate.toFixed(2)}x</button>
                    <button onClick={()=>setShowFullscreenBar(false)}><Minimize2 size={15}/>收起</button>
                  </div>
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
  isLive = false,
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
        title={isLive ? "点击切换直播线路" : "点击切换线路与解析源"}
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
  playerStatus = 'idle',
  isLive = false,
}) {
  const [activeTab, setActiveTab] = useState('episodes'); // 'episodes' | 'info' | 'sources'
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyStream = () => {
    if (navigator?.clipboard?.writeText && streamUrl) {
      navigator.clipboard.writeText(streamUrl).catch(() => {});
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  return (
    <div className="sangtian-console-card">
      {/* Sub-header Bar: Toggles & View Switches - Borrowed from bottom chat sub-bar */}
      <div className="sangtian-console-subbar">
        <div className="console-toggles">
          <div className="console-live-status">
            <span className="live-pill">{isLive ? 'LIVE 直连' : 'VOD 播放'}</span>
            <span>{playerStatus === 'playing' ? '播放中' : playerStatus === 'buffering' ? '缓冲中' : playerStatus === 'reconnecting' ? '自动重连中' : playerStatus === 'error' ? '播放失败' : '连接中'}</span>
          </div>
          <div className="console-toggle-item">
            <span className="toggle-label"><Sparkles size={12} className="sparkle-gold" /><span>{isLive ? '直播链路' : '播放模式'}</span></span>
            <span className="switch-badge active">{isLive ? '直连' : '解析'}</span>
          </div>
        </div>

        <div className="console-tab-switches">
          <button
            className={`console-tab-btn ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
            title={isLive ? "直播信息" : "剧集信息与简介"}
          >
            <FileText size={15} />
          </button>
          <button
            className={`console-tab-btn ${activeTab === 'episodes' ? 'active' : ''}`}
            onClick={() => setActiveTab('episodes')}
            title={isLive ? "频道线路" : "选集播放"}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            className={`console-tab-btn ${activeTab === 'sources' ? 'active' : ''}`}
            onClick={() => setActiveTab('sources')}
            title={isLive ? "直播线路设置" : "来源与线路设置"}
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
              <span className="section-eyebrow">{isLive ? "LIVE · 频道流" : "EPISODES · 选集列表"}</span>
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
              <span className="section-eyebrow">{isLive ? "LIVE · 当前直播" : "OVERVIEW · 详细资料"}</span>
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
              <span className="section-eyebrow">{isLive ? 'LIVE · 直播线路' : 'SOURCES · 换源与线路'}</span>
              <h4>{isLive ? '直播线路' : '视频源解析矩阵'}</h4>
            </div>

            {sources.length > 0 && (
              <div className="console-source-group">
                <span className="group-label">{isLive ? '当前直播源：' : '可用内容源：'}</span>
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
                <span className="group-label">{isLive ? '直播线路选择：' : '备用线路选择：'}</span>
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
            onClick={onTogglePip}
            title="画中画模式"
          >
            <Play size={18} />
          </button>

        </div>


        <button
          className="sangtian-submit-btn"
          onClick={onReplay}
          title="立即起播 / 重载起播"
          aria-label="起播"
        >
          <ArrowUp size={22} strokeWidth={2.6} />
        </button>
      </div>

    </div>
  );
}
