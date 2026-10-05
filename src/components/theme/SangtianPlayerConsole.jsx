import React, { useState, useEffect, useRef } from 'react';
import {
  Copy, Maximize2, Minimize2, RotateCw, Sparkles, Terminal, Paperclip,
  Play, Pause, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Rewind, FastForward,
  FileText, LayoutGrid, SlidersHorizontal, Check, RefreshCw, Ratio,
  Lock, Unlock, ListVideo, Square
} from 'lucide-react';

export function SangtianFloatingBar({
  playbackRate = 1.0,
  onChangeRate,
  currentTime = 0,
  duration = 0,
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

  const formatTime = value => {
    if (!Number.isFinite(value)) return '00:00';
    const total = Math.max(0, Math.floor(value));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const timeString = `${formatTime(currentTime)} / ${formatTime(duration)}`;

  return (
    <div className="sangtian-floating-bar">
      {!isLive && (
        <div className="sangtian-zoom-controls">
          <button
            className="sangtian-zoom-btn"
            onClick={() => handleCycleSpeed('down')}
            title="减速播放"
          >
            -
          </button>
          <span className="sangtian-speed-label">{playbackRate}x</span>
          <button
            className="sangtian-zoom-btn"
            onClick={() => handleCycleSpeed('up')}
            title="加速播放"
          >
            +
          </button>
        </div>
      )}

      <div
        className="sangtian-model-pill"
        style={{ cursor: 'default', userSelect: 'none' }}
      >
        <Sparkles size={14} className="sparkle-gold" />
        <span className="model-pill-text">{timeString}</span>
      </div>
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
  activeItemId,
  onBack,
  onFav,
  isFav = false,
}) {
  const [activeTab, setActiveTab] = useState('episodes'); // 'episodes' | 'info' | 'sources'
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedLiveCat, setSelectedLiveCat] = useState('全部');

  const handleCopyStream = () => {
    if (navigator?.clipboard?.writeText && streamUrl) {
      navigator.clipboard.writeText(streamUrl).catch(() => {});
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const liveCategories = React.useMemo(() => {
    if (!isLive || !relatedItems.length) return ['全部'];
    const cats = new Set();
    relatedItems.forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return ['全部', ...Array.from(cats)];
  }, [isLive, relatedItems]);

  const filteredLiveChannels = React.useMemo(() => {
    if (!isLive) return [];
    if (selectedLiveCat === '全部') return relatedItems;
    return relatedItems.filter(item => (item.category || '未分类') === selectedLiveCat);
  }, [isLive, selectedLiveCat, relatedItems]);

  return (
    <div className="sangtian-console-card">
      {/* Sub-header Bar: Toggles & View Switches */}
      <div className="sangtian-console-subbar">
        <div className="console-toggles">
          <div className="console-live-status">
            <span className="live-pill">{isLive ? 'LIVE 直连' : 'VOD 播放'}</span>
            <span>{playerStatus === 'playing' ? '播放中' : playerStatus === 'buffering' ? '缓冲中' : playerStatus === 'reconnecting' ? '自动重连中' : playerStatus === 'error' ? '播放失败' : '连接中'}</span>
          </div>
        </div>

        <div className="console-tab-switches">
          {onBack && (
            <button
              className="console-tab-btn back-button"
              onClick={onBack}
              title="返回"
              style={{ marginRight: '4px' }}
            >
              <ChevronLeft size={16} />
            </button>
          )}
          {onFav && (
            <button
              className={`console-tab-btn fav-button ${isFav ? 'active-fav' : ''}`}
              onClick={onFav}
              title={isFav ? "取消收藏" : "加入收藏"}
              style={{ marginRight: '6px', color: isFav ? '#e11d48' : 'inherit' }}
            >
              <Heart size={14} fill={isFav ? '#e11d48' : 'none'} />
            </button>
          )}
          <button
            className={`console-tab-btn ${activeTab === 'episodes' ? 'active' : ''}`}
            onClick={() => setActiveTab('episodes')}
            title={isLive ? "频道选择" : "选集播放"}
          >
            <LayoutGrid size={15} />
          </button>
          <button
            className={`console-tab-btn ${activeTab === 'info' ? 'active' : ''}`}
            onClick={() => setActiveTab('info')}
            title={isLive ? "直播信息" : "剧集信息与简介"}
          >
            <FileText size={15} />
          </button>
        </div>
      </div>

      {/* Main Interactive Content */}
      <div className="sangtian-console-body">
        {/* Tab 1: Episodes (选集) OR Channels Grid for Live */}
        {activeTab === 'episodes' && (
          <div className="console-episodes-section">
            <div className="console-section-header">
              <span className="section-eyebrow">
                {isLive ? (filteredLiveChannels.length > 0 ? "LIVE CHANNELS · 频道切换" : "LIVE DIRECT · 当前直播") : "EPISODES · 选集列表"}
              </span>
              <h4>{title}</h4>
            </div>

            {isLive ? (
              <div className="sangtian-channel-selector-wrapper">
                {/* Category Filter Pills */}
                {liveCategories.length > 1 && (
                  <div className="sangtian-console-category-scroll">
                    {liveCategories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        className={`console-category-pill ${selectedLiveCat === cat ? 'active' : ''}`}
                        onClick={() => setSelectedLiveCat(cat)}
                      >
                        <span>{cat}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Quick Line Candidates Bar if lines exist */}
                {candidates.length > 0 && (
                  <div className="console-quick-lines-bar">
                    <span className="quick-lines-label">当前线路:</span>
                    <div className="quick-lines-chips">
                      {candidates.map((c, index) => {
                        const isCurrentLine = c.candidateId === currentCandidateId;
                        const lineName = c.metadata?.label || c.label || (c.index != null ? `线路 ${c.index + 1}` : `线路 ${index + 1}`);
                        return (
                          <button
                            key={c.candidateId}
                            type="button"
                            className={`quick-line-pill ${isCurrentLine ? 'active' : ''}`}
                            onClick={() => onSelectCandidate?.(c.candidateId)}
                          >
                            {lineName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Channels Grid */}
                <div className="sangtian-channel-selection-grid">
                  {filteredLiveChannels.map((item) => {
                    const isCurrent = item.channelId === activeItemId;
                    return (
                      <button
                        key={item.channelId}
                        type="button"
                        className={`sangtian-channel-btn ${isCurrent ? 'active' : ''}`}
                        onClick={() => onSelectRelated?.(item)}
                      >
                        <div className="channel-logo-mini">
                          {item.logo ? <img src={item.logo} alt="" /> : <Radio size={14} />}
                        </div>
                        <div className="channel-info-mini">
                          <span className="channel-name-mini">{item.name}</span>
                          <span className="channel-sub-mini">
                            {isCurrent ? '● 正在播放' : (item.category || '直播频道')}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : episodes.length > 0 ? (
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
              <div className="sangtian-empty-text">当前内容暂无更多选集可供切换</div>
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

        {/* Related Recommendations (相关推荐) - Hidden for live because channels are in the main tab */}
        {!isLive && relatedItems.length > 0 && (
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
    </div>
  );
}
