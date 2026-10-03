import React, { useState } from 'react';
import { ChevronLeft, Clock3, Database, Film, Info, Radio, Search, Server, Settings, Trash2, Check, Download, Upload } from 'lucide-react';
import { LiveFeature } from '../features/live/LiveFeature.jsx';
import { SmartImage, EmptyState } from '../components/StateViews.jsx';
import { sourceConfigService } from '../services/sourceConfigService.js';

function Main({tab,movies,channels,favorites,history,sources,searches,progress,settings,onTab,onMovie,onLive,onLiveChannel,onSearchHistory,toggleFavorite,onClearData,onClearHistory,onSaveSources,onClearSearches,onRemoveSearch,onClearCache,onSourceEnabled,onSourceActive,onTestSource,onRemoveSource,onUpdateSettings}){
 const [favoriteSection,setFavoriteSection]=useState('movies');
 const [confirm,setConfirm]=useState(null); const [sourceForm,setSourceForm]=useState(null);
 if(tab==='live') return <LiveFeature channels={channels} sources={sources} favorites={favorites} onChannel={onLiveChannel} onPlay={onLive} onTab={onTab} toggleFavorite={toggleFavorite}/>;
 if(tab==='favorites'){
  const favoriteContentRecords=favorites.filter(i=>i.targetType==='content');
  const favMovies=favoriteContentRecords.map(record=>movies.find(m=>m.contentId===record.targetId)||{contentId:record.targetId,title:'暂时无法找到来源',year:'',category:'',poster:'',unresolved:true});
  const favChannels=channels.filter(c=>favorites.some(i=>i.targetType==='channel'&&i.targetId===c.channelId));
  return <Page><Header title="收藏"/><div className="seg"><button className={favoriteSection==='movies'?'active':''} onClick={()=>setFavoriteSection('movies')}>影视</button><button className={favoriteSection==='live'?'active':''} onClick={()=>setFavoriteSection('live')}>Live</button></div>{favoriteSection==='movies'?<><MovieGrid movies={favMovies.filter(movie=>!movie.unresolved)} onMovie={onMovie}/>{favMovies.filter(movie=>movie.unresolved).map(movie=><div className="info-card" key={movie.contentId}><Database size={18}/><div><b>暂时无法找到来源</b><span>收藏仍已保留：{movie.contentId}</span></div></div>)}{!favMovies.length&&<Empty text="还没有影视收藏"/>}</>:<div className="channel-list">{favChannels.map(c=><button className="menu" key={c.channelId} onClick={()=>onLiveChannel(c)}><Radio size={18}/><span>{c.name}<small>{c.category} · {c.streams.length} 条线路</small></span><ChevronLeft className="flip" size={17}/></button>)}{!favChannels.length&&<Empty text="还没有 Live 收藏"/>}</div>}</Page>;
 }
 if(tab==='history'){
  const historyMovies=history.filter(i=>i.targetType==='content').map(item=>({item,movie:movies.find(m=>m.contentId===item.targetId)||null}));
  const historyChannels=history.filter(i=>i.targetType==='channel').map(i=>channels.find(c=>c.channelId===i.targetId)).filter(Boolean);
  return <Page><Header title="播放历史"/>{historyMovies.length?<div className="movie-grid">{historyMovies.filter(({movie})=>movie).map(({movie,item})=>{const ep=movie.episodes?.find(e=>e.episodeId===item.episodeId);const pct=item.durationSeconds?Math.min(100,Math.round(item.positionSeconds/item.durationSeconds*100)):0;return <article className="movie-card history-card" key={item.historyId} onClick={()=>onMovie(movie)}><SmartImage src={movie.poster} alt={movie.title}/><div><b>{movie.title}</b><span>{ep?.title??'继续观看'} · {pct}%</span><small>最近观看：{new Date(item.lastPlayedAt||Date.now()).toLocaleString()}</small></div></article>})}</div>:<Empty text="还没有播放历史"/>}{historyMovies.filter(({movie})=>!movie).map(({item})=><div className="info-card" key={item.historyId}><Database size={18}/><div><b>暂时无法找到来源</b><span>播放历史已保留：{item.targetId}</span></div></div>)}{historyChannels.length>0&&<><SectionTitle title="Live"/><div className="channel-list">{historyChannels.map(c=><button className="menu" key={c.channelId} onClick={()=>onLiveChannel(c)}><Radio size={18}/><span>{c.name}<small>{c.category}</small></span><ChevronLeft className="flip" size={17}/></button>)}</div></>}</Page>;
 }
 if(tab==='search-history') return <Page><Header title="搜索历史"/><div className="actions"><button className="secondary" disabled={!searches.length} onClick={()=>setConfirm({type:'searches'})}>清空搜索历史</button></div><div className="history-list">{searches.map(i=><div className="menu" key={i.searchId}><Search size={18}/><button className="history-keyword" onClick={()=>onSearchHistory(i.keyword)}>{i.keyword}</button><em>{i.count} 次</em><button className="icon-button" aria-label="删除历史" onClick={()=>setConfirm({type:'search',id:i.searchId})}>×</button></div>)}{!searches.length&&<Empty text="还没有搜索历史"/>}</div>{confirm&&<ConfirmDialog title={confirm.type==='searches'?'清空搜索历史？':'删除这条搜索历史？'} onCancel={()=>setConfirm(null)} onConfirm={()=>{if(confirm.type==='searches')onClearSearches();else onRemoveSearch(confirm.id);setConfirm(null)}}/>}</Page>;
  if(tab==='sources') return <Page><Header title="源管理"/><div className="actions"><button className="secondary" onClick={()=>setSourceForm({sourceType:'live',name:''})}>添加源</button><button className="secondary" onClick={()=>sourceConfigService.download(sources)}><Download size={16}/>导出</button><label className="secondary file-button"><Upload size={16}/>导入<input type="file" accept=".json,.txt,.m3u,application/json,text/plain" hidden onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const parsed=await sourceConfigService.importFile(file);await onSaveSources(parsed)}catch(error){console.error(error)}finally{e.target.value=''}}}/></label></div><SectionTitle title="影视源"/><SourceList sources={sources.filter(s=>s.sourceType==='movie')} onEnabled={onSourceEnabled} onActive={onSourceActive} onTest={onTestSource} onRemove={onRemoveSource}/><SectionTitle title="Live 源"/><SourceList sources={sources.filter(s=>s.sourceType==='live')} onEnabled={onSourceEnabled} onActive={onSourceActive} onTest={onTestSource} onRemove={onRemoveSource}/><InfoCard title="源边界" text="影视源与 Live 源独立管理。支持标准 JSON 格式、M3U 播放列表以及 #genre# 分类 TXT 电视直播源文件。"/>{sourceForm&&<SourceForm value={sourceForm} onCancel={()=>setSourceForm(null)} onSave={source=>{
  const additions = Array.isArray(source) ? source : [{...source,sourceId:`source_${source.sourceType}_${Date.now()}`,enabled:true,status:'未测试'}];
  onSaveSources([...sources,...additions]);
  setSourceForm(null);
}}/>}</Page>;
 if(tab==='settings'){
  const playback=settings?.playback??{};
  const decoder=playback.decoder??{};
  const updatePlayback=(patch={})=>onUpdateSettings?.({
    playback:{
      ...playback,
      ...patch,
      decoder:{...(playback.decoder??{}),...(patch.decoder??{})},
    },
  });
  const playerLabel=value=>value==='ijk'?'IJKPlayer':value==='native'?'系统播放器':'ExoPlayer';
  const ijkDecoder=decoder.ijk==='hardware'?'硬件解码':decoder.ijk==='software'?'软件解码':'自动（硬件优先）';
  const order=(playback.fallbackOrder??['exo','ijk','native']).join(' → ');
  return <Page><Header title="设置"/>
   <SectionTitle title="播放设置"/>
   <SettingMenu icon={Radio} title="自动继续播放" value={settings?.autoplayResume?'开启':'关闭'} onClick={()=>onUpdateSettings?.({autoplayResume:!settings?.autoplayResume})}/>
   <SettingMenu icon={Radio} title="默认影视播放器" value={playerLabel(playback.moviePlayer)} onClick={()=>updatePlayback({moviePlayer:cycle(playback.moviePlayer??'exo',['exo','ijk','native'])})}/>
   <SettingMenu icon={Radio} title="默认直播播放器" value={playerLabel(playback.livePlayer)} onClick={()=>updatePlayback({livePlayer:cycle(playback.livePlayer??'exo',['exo','ijk','native'])})}/>
   <SettingMenu icon={Radio} title="失败自动切换" value={playback.fallbackEnabled===false?'关闭':'开启'} onClick={()=>updatePlayback({fallbackEnabled:playback.fallbackEnabled===false})}/>
   <SettingMenu icon={Radio} title="切换顺序" value={order} onClick={()=>updatePlayback({fallbackOrder:rotateOrder(playback.fallbackOrder)})}/>
   <SectionTitle title="解码设置"/>
   <SettingMenu icon={Radio} title="ExoPlayer 解码" value="自动（MediaCodec）" onClick={()=>{}}/>
   <SettingMenu icon={Radio} title="IJKPlayer 解码" value={ijkDecoder} onClick={()=>updatePlayback({decoder:{ijk:cycle(decoder.ijk??'auto',['auto','hardware','software'])}})}/>
   <SettingMenu icon={Radio} title="系统播放器解码" value="系统自动选择" onClick={()=>{}}/>
   <InfoCard title="解码说明" text="ExoPlayer/Media3 当前使用 Android MediaCodec 视频解码链路，不提供伪造的软件视频解码开关；IJKPlayer 支持硬件 MediaCodec 与 FFmpeg 软件解码；系统播放器由 Android 自动选择。"/>
   <SectionTitle title="线路设置"/>
   <SettingMenu icon={Radio} title="默认影视线路" value={settings?.defaultMovieSource||'自动选择'} onClick={()=>onUpdateSettings?.({defaultMovieSource:nextSource(sources,'movie',settings?.defaultMovieSource)})}/>
   <SettingMenu icon={Radio} title="默认直播线路" value={settings?.defaultLiveSource||'自动选择'} onClick={()=>onUpdateSettings?.({defaultLiveSource:nextSource(sources,'live',settings?.defaultLiveSource)})}/>
   <SectionTitle title="外观设置"/>
   <SettingMenu icon={Settings} title="主题" value={settings?.theme==='sangtian'?'桑田山河':settings?.theme==='light'?'浅色':'深色'} onClick={()=>onUpdateSettings?.({theme:cycle(settings?.theme||'sangtian',['sangtian','dark','light'])})}/>
   <SettingMenu icon={Settings} title="字体" value={settings?.fontSize==='large'?'大':settings?.fontSize==='small'?'小':'中'} onClick={()=>onUpdateSettings?.({fontSize:cycle(settings?.fontSize,['small','medium','large'])})}/>
   <SettingMenu icon={Settings} title="卡片显示" value={settings?.cardStyle==='compact'?'紧凑':'海报'} onClick={()=>onUpdateSettings?.({cardStyle:settings?.cardStyle==='compact'?'poster':'compact'})}/>
   <SettingMenu icon={Settings} title="显示密度" value={settings?.density==='compact'?'紧凑':'舒适'} onClick={()=>onUpdateSettings?.({density:settings?.density==='compact'?'comfortable':'compact'})}/>
   <SectionTitle title="数据设置"/>
   <Menu icon={Trash2} title="清除历史" onClick={()=>setConfirm({type:'history'})}/><Menu icon={Trash2} title="清除搜索记录" onClick={()=>setConfirm({type:'searches'})}/><Menu icon={Database} title="清除缓存" onClick={()=>{onClearCache();}}/>
   {confirm&&<ConfirmDialog title="确认清理？" onCancel={()=>setConfirm(null)} onConfirm={()=>{if(confirm.type==='history')onClearHistory();else onClearSearches();setConfirm(null)}}/>}
  </Page>;
 }
 if(tab==='data-management') return <Page><Header title="数据管理"/><Menu icon={Trash2} title="清理用户数据" onClick={()=>setConfirm({type:'all'})}/><Menu icon={Database} title="清理缓存" onClick={onClearCache}/><InfoCard title="不可逆操作" text="用户数据清理会删除收藏、历史、播放进度和搜索历史；源配置不会删除。"/>{confirm&&<ConfirmDialog title="确认清理用户数据？" onCancel={()=>setConfirm(null)} onConfirm={()=>{onClearData();setConfirm(null)}}/>}</Page>;
 if(tab==='about') return <Page><Header title="关于"/><InfoCard title="TVBox React" text="安卓手机竖屏影视与 Live 内容聚合应用。"/><InfoCard title="版本" text="0.3.0 · 产品架构实现版"/><InfoCard title="版权与开源" text="本项目遵循仓库中声明的开源与第三方依赖许可要求。"/><InfoCard title="架构" text="影视、Live、用户数据、源管理与播放内核保持独立边界。"/></Page>;
 return <Page><Header title="我的"/><div className="profile"><div className="avatar">T</div><div><b>TVBox 用户</b><span>本地数据独立存储 · 产品架构版</span></div></div><Menu icon={Clock3} title="播放历史" onClick={()=>onTab('history')} badge={history.length}/><Menu icon={Search} title="搜索历史" onClick={()=>onTab('search-history')} badge={searches.length}/><Menu icon={Server} title="源管理" onClick={()=>onTab('sources')} badge={sources.length}/><Menu icon={Settings} title="设置" onClick={()=>onTab('settings')}/><Menu icon={Database} title="数据管理" onClick={()=>onTab('data-management')}/><Menu icon={Info} title="关于" onClick={()=>onTab('about')}/></Page>;
}
function SourceList({sources,onEnabled,onActive,onTest,onRemove}){
  return <div className="source-list">{sources.map(source=>{
    const isTesting = source.status === '测试中';
    const isUnsupported = String(source.sourceCapability || '').startsWith('tvbox-')
      || String(source.adapterType || '').startsWith('tvbox-');
    const capabilityLabel = source.tvboxAdapterKind === 'drpy-js' ? 'Drpy JS待适配'
      : source.tvboxAdapterKind === 'csp' ? 'CSP待适配'
      : source.tvboxAdapterKind === 'jar' || source.tvboxAdapterKind === 'http-vod-with-jar' ? 'JAR待适配'
      : source.tvboxAdapterKind === 'ext' ? 'ext待适配'
      : source.tvboxAdapterKind === 'live-provider' ? 'Live提供器待适配'
      : isUnsupported ? 'TVBox扩展待适配' : '';
    const statusColor = (source.status==='正常'||source.status==='可用') ? '#22c55e' : (source.status==='不可用'||source.status==='异常') ? '#f87171' : isTesting ? '#38bdf8' : '#94a3b8';
    return (
      <div className="menu source-row" key={source.sourceId}>
        <Server size={19}/>
        <span>
          <b>{source.name}</b>
          <small>
            {source.sourceType}{source.liveMode==='tv1'?' · TV1专用':''} ·
            <span style={{color: statusColor, fontWeight: 600}}> {source.status}</span>
            {isUnsupported && <span style={{color:'#f59e0b',fontWeight:600}}> · {capabilityLabel}</span>}
            {source.isActive?' · 当前使用':''}
          </small>
        </span>
        <button className={source.isActive?'primary':'secondary'} disabled={isUnsupported} onClick={()=>onActive?.(source.sourceId)}>{source.isActive?'当前使用':isUnsupported?'待适配':'设为当前'}</button>
        <button className="secondary" disabled={isTesting||isUnsupported} onClick={()=>onTest(source)}>{isTesting?'测试中…':isUnsupported?'暂不可测':'测试'}</button>
        <button className="secondary" disabled={isUnsupported} onClick={()=>onEnabled(source.sourceId,!source.enabled)}>{source.enabled?<><Check size={15}/>停用</>:<>启用</>}</button>
        <button className="icon-button" onClick={()=>onRemove(source.sourceId)} aria-label="删除源">×</button>
      </div>
    );
  })}{!sources.length&&<Empty text="暂无内容源"/>}</div>;
}
const SourceForm=({value,onCancel,onSave})=>{
  const [name,setName]=useState(value.name);
  const [url,setUrl]=useState(value.url||'');
  const [sourceType,setSourceType]=useState(value.sourceType);
  const [liveMode,setLiveMode]=useState(value.liveMode||'generic');
  const [localFileSources,setLocalFileSources]=useState(null);
  const [fileStatus,setFileStatus]=useState('');
  const handleFile=async(e)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    try {
      const parsedSources = await sourceConfigService.parseLocalFile(file);
      setLocalFileSources(parsedSources);
      setUrl('');
      const fileName = file.name.replace(/\.[^.]+$/, '');
      if(!name) setName(fileName);
      if(parsedSources.length === 1) setSourceType(parsedSources[0].sourceType);
      setFileStatus(parsedSources.length > 1 ? `已识别为 ${parsedSources.length} 个源，保存后会一次性加入` : '本地文件已读取，将直接使用文件内容');
    } catch (err) {
      setLocalFileSources(null);
      setFileStatus(`文件读取失败：${err?.message || '格式无效'}`);
      console.error('File read failed', err);
    } finally {
      e.target.value='';
    }
  };
  const handleSave=()=>{
    if (localFileSources?.length) {
      onSave(localFileSources);
      return;
    }
    let finalUrl = url.trim();
    let finalType = sourceType;
    if (finalUrl.includes('#genre#') || finalUrl.startsWith('#EXTM3U')) {
      finalUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(finalUrl)}`;
      finalType = 'live';
    }
    const finalName = name.trim() || (finalType === 'live' ? '自定义直播源' : '自定义影视源');
    onSave({name: finalName, url: finalUrl, sourceType: finalType, ...(finalType === 'live' ? { liveMode } : {})});
  };
  return <div className="modal-backdrop"><div className="modal">
    <b>添加内容源</b>
    <div className="info-card" style={{marginTop:0,marginBottom:10,padding:10}}>
      <Info size={14}/>
      <span style={{fontSize:11}}>支持输入网络 URL、直接粘贴带 #genre# 文本或选择本地 .txt / .m3u / .json 文件。</span>
    </div>
    <input value={name} onChange={e=>setName(e.target.value)} placeholder="源名称（选填）"/>
    <div style={{display:'flex',gap:8}}>
      <input style={{flex:1}} value={url} onChange={e=>{
        const val = e.target.value;
        setUrl(val);
        if (val.includes('#genre#') || val.startsWith('#EXTM3U')) {
          setSourceType('live');
          if (val.includes('#genre#')) setLiveMode('tv1');
        }
      }} placeholder="源地址 URL 或直接粘贴文本数据"/>
      <label className="secondary" style={{padding:'10px 14px',borderRadius:10,border:'1px solid #303744',background:'#171b23',cursor:'pointer',display:'grid',placeItems:'center'}} title="选择本地文件">
        <Upload size={16}/>
        <input type="file" accept=".txt,.m3u,.json,text/plain,application/json" hidden onChange={handleFile}/>
      </label>
    </div>
    <select value={sourceType} onChange={e=>setSourceType(e.target.value)} disabled={Boolean(localFileSources?.length)}>
      <option value="movie">影视源</option>
      <option value="live">Live 源</option>
    </select>
    {sourceType==='live' && <select value={liveMode} onChange={e=>setLiveMode(e.target.value)} disabled={Boolean(localFileSources?.length)}><option value="generic">通用 Live 兼容入口</option><option value="tv1">TV1 专用直播（#genre# TXT）</option></select>}
    <div style={{fontSize:11,color:'#8f9aaa',minHeight:16}}>{fileStatus}</div>
    <div className="actions">
      <button className="secondary" onClick={onCancel}>取消</button>
      <button className="primary" disabled={!localFileSources?.length && !url.trim()} onClick={handleSave}>保存</button>
    </div>
  </div></div>;
};
const ConfirmDialog=({title,onCancel,onConfirm})=><div className="modal-backdrop"><div className="modal"><b>{title}</b><div className="actions"><button className="secondary" onClick={onCancel}>取消</button><button className="primary" onClick={onConfirm}>确认</button></div></div></div>;
const Page=({children})=><main className="page">{children}</main>;
const Header=({title})=><header><div><span className="eyebrow">TVBOX REACT</span><h2>{title}</h2></div></header>;
const SectionTitle=({title})=><div className="section-title"><h3>{title}</h3></div>;
const InfoCard=({title,text})=><div className="info-card"><Info size={18}/><div><b>{title}</b><span>{text}</span></div></div>;
const Empty=({text})=><div className="empty"><Film size={22}/><span>{text}</span></div>;
const MovieGrid=React.memo(function MovieGrid({movies,onMovie}){return <div className="movie-grid">{movies.map(movie=><article className="movie-card" key={movie.contentId} onClick={()=>onMovie(movie)}><SmartImage src={movie.poster} alt={movie.title}/><div><b>{movie.title}</b><span>{movie.year} · {movie.category}</span></div></article>)}</div>});
const cycle=(value,values)=>{const index=values.indexOf(value);return values[(index+1)%values.length]};
const rotateOrder=(order=['exo','ijk','native'])=>{const normalized=['exo','ijk','native'].filter(item=>order?.includes(item));const safe=normalized.length===3?normalized:['exo','ijk','native'];return [...safe.slice(1),safe[0]]};
const nextSource=(sources,type,current)=>{const list=sources.filter(source=>source.sourceType===type&&source.enabled!==false);if(!list.length)return null;const ids=[null,...list.map(source=>source.sourceId)];const index=Math.max(0,ids.indexOf(current));return ids[(index+1)%ids.length]??null};
const Menu=({icon:Icon,title,onClick,badge})=><button className="menu" onClick={onClick}><Icon size={19}/><span>{title}</span>{badge>0&&<em>{badge}</em>}<ChevronLeft className="flip" size={17}/></button>;
const SettingMenu=({icon:Icon,title,value,onClick})=><button className="menu setting-menu" onClick={onClick}><Icon size={19}/><span>{title}<small>{value}</small></span><ChevronLeft className="flip" size={17}/></button>;
export {Main as MainPage};
