import React from 'react';
import { ChevronLeft, Clock3, Database, Film, Info, Radio, Search, Server, Settings, Trash2 } from 'lucide-react';
import { LiveFeature } from '../features/live/LiveFeature.jsx';
import { SmartImage } from '../components/StateViews.jsx';

function Main({tab,movies,channels,favorites,history,sources,searches,onTab,onMovie,onLive,onLiveChannel,toggleFavorite,onClearData,onClearCache}){
 if(tab==='live')return <LiveFeature channels={channels} favorites={favorites} onChannel={onLiveChannel} onPlay={onLive} onTab={onTab} toggleFavorite={toggleFavorite}/>;
 if(tab==='favorites'){
  const favMovies=movies.filter(m=>favorites.some(i=>i.targetType==='content'&&i.targetId===m.contentId));
  const favChannels=channels.filter(c=>favorites.some(i=>i.targetType==='channel'&&i.targetId===c.channelId));
  return <Page><Header title="收藏"/><div className="seg"><button className="active">影视</button></div><MovieGrid movies={favMovies} onMovie={onMovie}/><SectionTitle title="Live 频道"/><div className="channel-list">{favChannels.map(c=><button className="menu" key={c.channelId} onClick={()=>onLiveChannel(c)}><Radio size={18}/><span>{c.name}<small>{c.category} · {c.streams.length} 条线路</small></span><ChevronLeft className="flip" size={17}/></button>)}</div>{!favMovies.length&&!favChannels.length&&<Empty text="还没有收藏内容"/>}</Page>;
 }
 if(tab==='history'){
  const historyMovies=history.filter(i=>i.targetType==='content').map(i=>movies.find(m=>m.contentId===i.targetId)).filter(Boolean);
  const historyChannels=history.filter(i=>i.targetType==='channel').map(i=>channels.find(c=>c.channelId===i.targetId)).filter(Boolean);
  return <Page><Header title="播放历史"/><MovieGrid movies={historyMovies} onMovie={onMovie}/>{!!historyChannels.length&&<SectionTitle title="Live"/>}<div className="channel-list">{historyChannels.map(c=><button className="menu" key={c.channelId} onClick={()=>onLiveChannel(c)}><Radio size={18}/><span>{c.name}<small>{c.category}</small></span><ChevronLeft className="flip" size={17}/></button>)}</div>{!historyMovies.length&&!historyChannels.length&&<Empty text="还没有播放历史"/>}</Page>;
 }
 if(tab==='search-history')return <Page><Header title="搜索历史"/><div className="history-list">{searches.map(i=><div className="menu" key={i.searchId}><Search size={18}/><span>{i.keyword}</span><em>{i.count} 次</em></div>)}{!searches.length&&<Empty text="还没有搜索历史"/>}</div></Page>;
 if(tab==='sources')return <Page><Header title="源管理"/><SectionTitle title="影视源"/>{sources.filter(s=>s.sourceType==='movie').map(s=><SourceRow key={s.sourceId} source={s}/>)}<SectionTitle title="Live 源"/>{sources.filter(s=>s.sourceType==='live').map(s=><SourceRow key={s.sourceId} source={s}/>)}<InfoCard title="源边界" text="影视源与 Live 源独立管理；添加、导入、导出、测试等高级能力由后续源管理方案扩展。"/></Page>;
 if(tab==='settings')return <Page><Header title="设置"/><Menu icon={Settings} title="通用设置"/><Menu icon={Radio} title="播放行为"/><InfoCard title="数据保护" text="设置与用户数据独立保存；清理数据不会删除源配置。"/></Page>;
 if(tab==='data-management')return <Page><Header title="数据管理"/><Menu icon={Trash2} title="清理用户数据" onClick={()=>{if(window.confirm('确认清理收藏、历史、进度和搜索历史？源配置不会删除。')){onClearData();alert('用户数据已清理。')}}}/><Menu icon={Database} title="清理缓存" onClick={()=>{onClearCache();alert('缓存已清理。')}}/><InfoCard title="不可逆操作" text="用户数据清理会删除收藏、历史、播放进度和搜索历史，请谨慎操作。"/></Page>;
 if(tab==='about')return <Page><Header title="关于"/><InfoCard title="TVBox React" text="安卓手机竖屏影视与 Live 内容聚合应用。"/><InfoCard title="版本" text="0.3.0 · 产品架构实现版"/><InfoCard title="架构" text="影视、Live、用户数据、源管理与播放内核保持独立边界。"/></Page>;
 return <Page><Header title="我的"/><div className="profile"><div className="avatar">T</div><div><b>TVBox 用户</b><span>本地数据独立存储 · 产品架构版</span></div></div><Menu icon={Clock3} title="播放历史" onClick={()=>onTab('history')} badge={history.length}/><Menu icon={Search} title="搜索历史" onClick={()=>onTab('search-history')} badge={searches.length}/><Menu icon={Server} title="源管理" onClick={()=>onTab('sources')} badge={sources.length}/><Menu icon={Settings} title="设置" onClick={()=>onTab('settings')}/><Menu icon={Database} title="数据管理" onClick={()=>onTab('data-management')}/><Menu icon={Info} title="关于" onClick={()=>onTab('about')}/></Page>;
}
const SourceRow=({source})=><div className="menu"><Server size={19}/><span>{source.name}<small>{source.sourceType} · {source.status}</small></span><em>{source.enabled?'启用':'停用'}</em></div>;
const Page=({children})=><main className="page">{children}</main>;
const Header=({title})=><header><div><span className="eyebrow">TVBOX REACT</span><h2>{title}</h2></div></header>;
const SectionTitle=({title})=><div className="section-title"><h3>{title}</h3></div>;
const InfoCard=({title,text})=><div className="info-card"><Info size={18}/><div><b>{title}</b><span>{text}</span></div></div>;
const Empty=({text})=><div className="empty"><Film size={22}/><span>{text}</span></div>;
const MovieGrid=React.memo(function MovieGrid({movies,onMovie}){return <div className="movie-grid">{movies.map(movie=><article className="movie-card" key={movie.contentId} onClick={()=>onMovie(movie)}><SmartImage src={movie.poster} alt={movie.title} loading="lazy" decoding="async"/><div><b>{movie.title}</b><span>{movie.year} · {movie.category}</span></div></article>)}</div>});
const Menu=({icon:Icon,title,onClick,badge})=><button className="menu" onClick={onClick}><Icon size={19}/><span>{title}</span>{badge>0&&<em>{badge}</em>}<ChevronLeft className="flip" size={17}/></button>;
export {Main as MainPage};
