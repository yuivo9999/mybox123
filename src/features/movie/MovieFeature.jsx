import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Film, Heart, Play, Search, X } from 'lucide-react';
import { movieService } from '../../services/movieService.js';
import { searchMovieSources } from '../../services/movieSourceService.js';
import { getCategoryIdByLabel } from '../../config/mediaTaxonomy.js';
import { usePageState, pageStateStore } from '../../state/pageStateStore.js';
import { SmartImage, EmptyState } from '../../components/StateViews.jsx';
import { MoviePlaybackPage } from './MoviePlaybackPage.jsx';

export function MovieFeature(props){
 const { route,tab,selected,movies=[],channels=[],history,progress,selectedSources={},sources=[],favorites,onMovie,onPlay,onTab,onBack,onLive,recordSearch,toggleFavorite,onSelectMovieSource,movieCategories=[],movieActiveCategory=null,movieCategoryLoading=false,onLoadMovieCategory }=props;
 const page=usePageState(); const movieState=page.movies;
 useEffect(()=>{
  const pageKey=route==='search'?'search':tab==='movies'?'movies':'home';
  const saved=page[pageKey]?.scrollTop??0;
  requestAnimationFrame(()=>window.scrollTo(0,saved));
  const save=()=>pageStateStore.patch(pageKey,{scrollTop:window.scrollY});
  window.addEventListener('scroll',save,{passive:true});
  return()=>window.removeEventListener('scroll',save);
 },[route,tab]);
 const feature=useMemo(()=>createMovieFeature({movies,history,progress}),[movies,history]);
 if(route==='search') return <MovieSearch movies={movies} sources={sources} initial={page.search.query} recordSearch={recordSearch} onMovie={onMovie} onPlay={onPlay} onBack={onBack} onQuery={query=>pageStateStore.patch('search',{query})}/>;
 if(route==='detail'){const movie=feature.getDetail(selected?.contentId??selected) || (selected?.contentId ? selected : null);if(!movie)return <MovieEmpty text="影视内容不存在" onBack={onBack}/>;return <MovieDetail movie={movie} movies={movies} sources={sources} selectedSourceId={selectedSources?.movie} onMovie={onMovie} favorite={favorites.some(i=>i.targetType==='content'&&i.targetId===movie.contentId)} onBack={onBack} onPlay={onPlay} onFavorite={()=>toggleFavorite('content',movie.contentId)}/>;}
 if(route==='movie-play') return <MoviePlaybackPage request={selected} movies={movies} favorites={favorites} toggleFavorite={toggleFavorite} onBack={onBack} onEpisode={onPlay} onMovie={onMovie} onTab={onTab}/>
 if(tab==='movies') return <MovieCatalog movies={movies} sources={sources} state={movieState} setState={patch=>pageStateStore.patch('movies',patch)} movieCategories={movieCategories} movieActiveCategory={movieActiveCategory} movieCategoryLoading={movieCategoryLoading} onLoadMovieCategory={onLoadMovieCategory} onMovie={onMovie} onPlay={onPlay} onSearch={()=>onMovie(null,'search')} recordSearch={recordSearch}/>;
 return <MovieHome feature={feature} movies={movies} channels={channels} sources={sources} selectedSourceId={selectedSources?.movie} movieCategories={movieCategories} movieActiveCategory={movieActiveCategory} movieCategoryLoading={movieCategoryLoading} onLoadMovieCategory={onLoadMovieCategory} onSelectMovieSource={onSelectMovieSource} onTab={onTab} onMovie={onMovie} onPlay={onPlay} onLive={onLive} onSearch={()=>onMovie(null,'search')}/>;
}

export function createMovieFeature({movies=[],history=[],progress=[]}={}){return{
 getHome:(options)=>movieService.getHome({movies,history,progress,...(options??{})}),
 getList:(options)=>movieService.list({movies,...(options??{})}),
 search:(keyword)=>movieService.search({movies,keyword}),
 getDetail:(contentId)=>movieService.getDetail({movies,contentId}),
 getEpisode:(contentId,episodeId)=>movieService.getEpisode({movies,contentId,episodeId}),
 getRelated:(movie)=>movieService.getRelated({movies,movie}),
};}

function MovieHome({feature,movies=[],channels,sources=[],selectedSourceId,movieCategories=[],movieActiveCategory,movieCategoryLoading,onLoadMovieCategory,onSelectMovieSource,onTab,onMovie,onPlay,onLive,onSearch}){
 const home=feature.getHome();
 const movieSources=sources.filter(source=>source.sourceType==='movie'&&source.enabled!==false);
 const sourceSelector=<MovieSourceSelector sources={movieSources} selectedSourceId={selectedSourceId} onChange={onSelectMovieSource}/>;
 const categoryItems=movieCategories.filter(item=>!item.sourceId||item.sourceId===selectedSourceId);
 const active=movieActiveCategory&&(!selectedSourceId||movieActiveCategory.sourceId===selectedSourceId)
   ? movieActiveCategory
   : categoryItems[0] ?? null;
 const currentMovies=active
   ? moviesForCategory(movies, active)
   : [];
 if(!movieSources.length) return <Page><header className="top-header"><div><span className="eyebrow">TVBOX REACT</span><h2>首页</h2></div><button className="icon-button" aria-label="搜索" onClick={onSearch}><Search/></button></header><div className="empty state-view"><Film size={24}/><b>暂无影视源</b><span>当前还没有配置影视内容源</span><button className="primary" onClick={()=>onTab('sources')}>去源管理</button></div></Page>;
 return <Page><header className="top-header"><div><span className="eyebrow">TVBOX REACT</span><h2>首页</h2></div><button className="icon-button" aria-label="搜索" onClick={onSearch}><Search/></button></header>{sourceSelector}
  <SectionTitle title="内容分类" action={movieCategoryLoading?'加载中…':'按需加载'}/>
  <div className="chips category-lazy-chips">{categoryItems.map(category=><button className={active?.id===category.id?'active':''} key={category.sourceId+':'+category.id+':'+category.name} disabled={movieCategoryLoading} onClick={()=>onLoadMovieCategory?.(category)}>{category.name}</button>)}</div>
  {!active&&<div className="empty state-view"><Film size={22}/><b>正在读取分类</b><span>只读取分类索引，不下载整库内容。</span></div>}
  {active&&<><SectionTitle title={active.name} action="更多" onAction={()=>{pageStateStore.patch('movies',{category:active.name,page:1});onTab('movies')}}/>{movieCategoryLoading?<div className="empty compact"><span>正在加载“{active.name}”…</span></div>:currentMovies.length?<MovieGrid movies={currentMovies} onMovie={onMovie}/>:<MovieEmpty compact text={`“${active.name}”暂无内容或该源暂未返回结果`}/>}</>}
  <SectionTitle title="继续观看"/><div className="continue-row">{home.continueWatching.length?home.continueWatching.map(({movie,episodeIndex,history:item})=><div className="continue" key={item.historyId} onClick={()=>onPlay(movie,episodeIndex)}><SmartImage src={movie.poster} fallback={<div className="image-placeholder"><Film size={18}/></div>}/><div><b>{movie.title}</b><small>{movie.episodes?.[episodeIndex]?.title??'继续观看'} · {Math.floor((item.positionSeconds??0)/60)} 分钟</small></div></div>):<MovieEmpty compact text="暂无观看记录"/>}</div>
  <SectionTitle title="Live 快捷入口"/><div className="live-banner" onClick={()=>onTab('live')}><span><b>Live 直播中心</b><small>{channels.length} 个频道</small></span><ChevronLeft className="flip"/></div>{channels[0]&&<button className="movie-live-entry" onClick={()=>onLive(channels[0])}><Play size={15}/>直接播放示例频道</button>}
 </Page>;
}
function moviesForCategory(movies=[], category){
 const sourceItems=movies??[];
 return sourceItems.filter(movie =>
   (movie.sourceCategoryIds??[]).map(String).includes(String(category?.id??'')) ||
   (movie.sourceCategoryNames??[]).includes(String(category?.name??'')) ||
   String(movie.sourceCategoryId??'')===String(category?.id??'') ||
   String(movie.sourceCategoryName??'')===String(category?.name??'')
 );
}

function MovieSourceSelector({sources=[],selectedSourceId,onChange}){
 const [open,setOpen]=useState(false);
 const [draftSourceId,setDraftSourceId]=useState(selectedSourceId||'');
 useEffect(()=>{if(!open)setDraftSourceId(selectedSourceId||'');},[selectedSourceId,open]);
 const selected=sources.find(source=>source.sourceId===selectedSourceId);
 const close=()=>{setDraftSourceId(selectedSourceId||'');setOpen(false);};
 const apply=()=>{setOpen(false);if(draftSourceId&&draftSourceId!==selectedSourceId)onChange?.(draftSourceId);};
 return <section className="source-selector" style={{marginBottom:16}}>
   <div className="section-title" style={{marginBottom:8}}><h3>影视源</h3><span style={{fontSize:12,color:'#8f9aaa'}}>{sources.length} 个可用源</span></div>
   <button className="source-selector-trigger" type="button" aria-expanded={open} onClick={()=>{if(!open)setDraftSourceId(selectedSourceId||'');setOpen(value=>!value)}}>
     <span className="source-selector-trigger-copy"><b>{selected?.name||'请选择影视源'}</b><small>{selected?'当前使用，点击切换':'选择后才开始加载'}</small></span>
     <ChevronRight size={18} className={open?'source-selector-chevron open':'source-selector-chevron'}/>
   </button>
   {open&&<div className="source-selector-popover" role="dialog" aria-label="选择影视源">
     <div className="source-selector-popover-head"><div><b>选择影视源</b><small>临时勾选，点击“选择”后才会生效</small></div><button className="icon-button" type="button" aria-label="关闭" onClick={close}><X size={17}/></button></div>
     <div className="source-selector-list" role="radiogroup" aria-label="影视源列表">
       {sources.map(source=>{const checked=draftSourceId===source.sourceId;return <button className={'source-selector-item'+(checked?' selected':'')} type="button" key={source.sourceId} role="radio" aria-checked={checked} onClick={()=>setDraftSourceId(source.sourceId)}>
         <span className="source-selector-name" title={source.name}>{source.name}</span>
         <span className={'source-selector-radio'+(checked?' checked':'')} aria-hidden="true">{checked&&<span/>}</span>
       </button>})}
       {!sources.length&&<div className="source-selector-empty">暂无可用影视源</div>}
     </div>
     <div className="source-selector-footer"><button className="secondary" type="button" onClick={close}>不选</button><button className="primary" type="button" disabled={!draftSourceId} onClick={apply}>选择</button></div>
   </div>}
   <small className="source-selector-hint">一次只加载当前选择的影视源，避免多个源同时请求。</small>
 </section>;
}

function MovieCatalog({movies,state,setState,onMovie,onPlay,onSearch,recordSearch,sources=[],movieCategories=[],movieActiveCategory,movieCategoryLoading,onLoadMovieCategory}){
 const home=useMemo(()=>movieService.getHome({movies}),[movies]); const categories=movieCategories.length?movieCategories.filter(item=>!item.sourceId||item.sourceId===sources.find(source=>source.sourceType==='movie'&&source.enabled!==false)?.sourceId):[];
 const [queryInput,setQueryInput]=useState('');
 const submitSearch=()=>{
  const keyword=String(queryInput||'').trim();
  if(!keyword)return;
  pageStateStore.patch('search',{query:keyword});
  recordSearch?.(keyword);
  onSearch?.(keyword);
 };
 const selectedType=state.category==='电影'?'movie':state.category==='电视剧'?'tv':state.category==='综艺'?'variety':null;
 const subcategories=selectedType?(home.taxonomy?.[selectedType]??[]):[];
 const listMeta=movieCategoryLoading ? {items:[],page:state.page,pageSize:state.pageSize,total:0,hasMore:false} : (movieActiveCategory ? {items:moviesForCategory(movies,movieActiveCategory).slice((Math.max(1,state.page)-1)*state.pageSize,Math.max(1,state.page)*state.pageSize),page:Math.max(1,state.page),pageSize:state.pageSize,total:moviesForCategory(home,movieActiveCategory).length,hasMore:Math.max(1,state.page)*state.pageSize<moviesForCategory(home,movieActiveCategory).length} : movieService.list({movies,...state})); const apply=(patch)=>setState({...patch,page:1});
 const filters=home.filters??{}; const values=(key)=>['全部',...(filters[key]??[])];
 return <Page><Header title="影视"/><div className="searchbox"><Search size={18}/><input value={queryInput} onChange={e=>setQueryInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitSearch()}} placeholder="搜索影视内容"/><button className="secondary search-submit" type="button" onClick={submitSearch}>搜索</button>{queryInput&&<button className="icon-button" aria-label="清空搜索" type="button" onClick={()=>setQueryInput('')}><X size={16}/></button>}</div>
 <div className="chips category-lazy-chips">{categories.map(item=>{const selected=(movieActiveCategory?.id===item.id)||(state.category===item.name);return <button className={selected?'active':''} disabled={movieCategoryLoading} onClick={()=>{setState({category:item.name,page:1,filters:{...state.filters,categoryId:''}});onLoadMovieCategory?.(item)}} key={item.sourceId+':'+item.id+':'+item.name}>{item.name}</button>})}</div>
 {movieCategoryLoading&&<div className="empty compact"><span>正在加载“{movieActiveCategory?.name||state.category||'当前分类'}”…</span></div>}
 <div className="filter-row"><select value={state.filters.type||'全部'} onChange={e=>setState({filters:{...state.filters,type:e.target.value==='全部'?'':e.target.value},page:1})}>{values('types').map(x=><option key={x}>{x}</option>)}</select><select value={state.filters.year||'全部'} onChange={e=>setState({filters:{...state.filters,year:e.target.value==='全部'?'':e.target.value},page:1})}>{values('years').map(x=><option key={x}>{x}</option>)}</select><select value={state.filters.region||'全部'} onChange={e=>setState({filters:{...state.filters,region:e.target.value==='全部'?'':e.target.value},page:1})}>{values('regions').map(x=><option key={x}>{x}</option>)}</select><select value={state.filters.status||'全部'} onChange={e=>setState({filters:{...state.filters,status:e.target.value==='全部'?'':e.target.value},page:1})}>{values('statuses').map(x=><option key={x}>{x}</option>)}</select><select value={state.sort} onChange={e=>setState({sort:e.target.value,page:1})}>{[['default','默认'],['latest','最新'],['popular','热门'],['time','时间'],['title','名称']].map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></div>
 {listMeta.items.length
   ? <MovieGrid movies={listMeta.items} onMovie={onMovie}/>
   : <EmptyState text={movies.length?'当前筛选暂无内容':'暂无影视内容'}/>}
 {!state.query.trim()&&listMeta.items.length>0&&<div className="pagination"><button disabled={state.page<=1} onClick={()=>setState({page:state.page-1})}>上一页</button><span>第 {state.page} 页 / 共 {Math.max(1,Math.ceil(listMeta.total/state.pageSize))} 页</span><button disabled={!listMeta.hasMore} onClick={()=>setState({page:state.page+1})}>下一页</button></div>}</Page>;
}

function MovieSearch({movies,initial,recordSearch,onMovie,onPlay,onBack,onQuery,sources=[]}){
 const [query,setQuery]=useState(initial||'');
 const [submitted,setSubmitted]=useState(String(initial||'').trim());
 const submitSearch=()=>{
  const keyword=String(query||'').trim();
  if(!keyword)return;
  setSubmitted(keyword);
  onQuery?.(keyword);
  recordSearch?.(keyword);
 };
 return <Page><button className="back" onClick={onBack}><ChevronLeft/>返回</button><Header title="搜索结果"/><div className="searchbox"><Search size={18}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')submitSearch()}} placeholder="搜索全部影视源"/><button className="secondary search-submit" type="button" onClick={submitSearch}>搜索</button>{query&&<button className="icon-button" aria-label="清空搜索" type="button" onClick={()=>setQuery('')}><X size={16}/></button>}</div>{!submitted?<EmptyState text="输入关键词后点击“搜索”"/>:<GlobalMovieSearch query={submitted} sources={sources} onMovie={onMovie} onPlay={(movie)=>onPlay?.(movie,0,movie?.sourceId,'search')}/>}</Page>;
}

function GlobalMovieSearch({query,sources=[],onMovie,onPlay}){
 const [state,setState]=useState({loading:true,groups:[],failed:[],error:'',completed:0,totalSources:0});
 const normalizedQuery=String(query||'').trim();
 useEffect(()=>{
   if(!normalizedQuery){
     setState({loading:false,groups:[],failed:[],error:'',completed:0,totalSources:0});
     return undefined;
   }
   const controller=new AbortController();
   let active=true;
   const totalSources=sources.filter(source=>source?.sourceType==='movie'&&source?.enabled!==false).length;
   setState({loading:true,groups:[],failed:[],error:'',completed:0,totalSources});
   searchMovieSources(sources,normalizedQuery,{signal:controller.signal,pageSize:20,timeoutMs:5000,onSourceResult:(entry,meta)=>{
     if(!active)return;
     setState(current=>({...current,
       groups:entry.status==='fulfilled'?[...current.groups,entry]:current.groups,
       failed:entry.status==='rejected'?[...current.failed,entry]:current.failed,
       completed:meta?.completed??current.completed,
     }));
   }}).then(result=>{
     if(!active)return;
     setState(current=>({...current,loading:false,groups:result.results??current.groups,failed:result.failed??current.failed,completed:result.completed??current.completed}));
   }).catch(error=>{
     if(!active||error?.name==='AbortError')return;
     setState(current=>({...current,loading:false,error:error?.message||'搜索失败'}));
   });
   return()=>{active=false;controller.abort();};
 },[normalizedQuery,sources]);
 const total=state.groups.reduce((sum,group)=>sum+(group.items?.length??0),0);
 if(!normalizedQuery)return <EmptyState text="输入关键词后点击“搜索”"/>;
 if(state.loading)return <div><div className="empty state-view"><Search size={22}/><b>正在逐源搜索</b><span>已完成 {state.completed} / {state.totalSources} 个影视源，结果会持续显示。</span></div>{state.groups.filter(group=>(group.items?.length??0)>0).map(group=><section key={group.sourceId}><div className="section-title" style={{marginBottom:8}}><h3>{group.sourceName}</h3><span style={{fontSize:12,color:'#8f9aaa'}}>{group.items.length} 条</span></div><MovieGrid movies={group.items} onMovie={onPlay||onMovie}/></section>)}</div>;
 if(state.error)return <EmptyState text={state.error}/>;
 if(!total&&!state.failed.length)return <EmptyState text={<>没有找到“{query}”的同名影视剧</>}/>;
 return <div><SectionTitle title="全源搜索结果" action={String(total)+' 条'}/><div style={{display:'grid',gap:18}}>{state.groups.filter(group=>(group.items?.length??0)>0).map(group=><section key={group.sourceId}><div className="section-title" style={{marginBottom:8}}><h3>{group.sourceName}</h3><span style={{fontSize:12,color:'#8f9aaa'}}>{group.items.length} 条</span></div><MovieGrid movies={group.items} onMovie={onPlay||onMovie}/></section>)}</div>{state.failed.length>0&&<div style={{fontSize:11,color:'#8f9aaa',marginTop:12}}>另有 {state.failed.length} 个源未返回结果，已跳过，不影响其他源。</div>}</div>;
}

function MovieDetail({movie,movies,sources=[],selectedSourceId,onMovie,onBack,onPlay,favorite,onFavorite}){
 const [otherSourceSearchOpen,setOtherSourceSearchOpen]=useState(false);
 const sourceIds=[...new Set((movie.sourceRefs??[]).map(ref=>ref.sourceId).filter(Boolean))]; const sourceMap=new Map(sources.map(source=>[source.sourceId,source.name])); const [sourceId,setSourceId]=useState(sourceIds.includes(selectedSourceId)?selectedSourceId:(sourceIds[0]??'')); const [episodePage,setEpisodePage]=useState(0); const related=movieService.getRelated({movies,movie}); const groups=[];for(let i=0;i<(movie.episodes?.length??0);i+=50)groups.push(movie.episodes.slice(i,i+50)); const currentEpisodes=groups[episodePage]??[];
 return <Page><button className="back" onClick={onBack}><ChevronLeft/>返回</button><div className="detail-hero"><SmartImage src={movie.poster} alt={movie.title} fallback={<div className="image-placeholder"><Film/></div>}/><div><span className="eyebrow">{movie.category} · {movie.year}</span><h1>{movie.title}</h1><div className="detail-meta"><span>年份：{movie.year||'—'}</span>{movie.region&&<span>地区：{movie.region}</span>}<span>类型：{movie.category||'—'}</span>{movie.director&&<span>导演：{movie.director}</span>}{movie.actors?.length>0&&<span>演员：{movie.actors.join('、')}</span>}</div><p>{movie.description||'暂无简介'}</p><div className="actions"><button className="primary" onClick={()=>onPlay(movie,0,sourceId)}><Play size={16}/>播放</button><button className={favorite?'secondary active-fav':'secondary'} onClick={onFavorite}><Heart size={16} fill={favorite?'currentColor':'none'}/>{favorite?'已收藏':'收藏'}</button></div></div></div>
 <SectionTitle title="剧集"/>{groups.length>1&&<div className="chips episode-groups">{groups.map((_,i)=><button key={i} className={episodePage===i?'active':''} onClick={()=>setEpisodePage(i)}>{i*50+1}–{Math.min((i+1)*50,movie.episodes.length)}</button>)}</div>}<div className="episode-grid">{currentEpisodes.map((episode,index)=><button key={episode.episodeId} onClick={()=>onPlay(movie,episodePage*50+index,sourceId)}>{episode.title}</button>)}</div>
 <SectionTitle title="其他源搜索" action="搜索同名" onAction={()=>setOtherSourceSearchOpen(true)}/><div className="info-card" style={{marginTop:-2,marginBottom:16}}><Search size={16}/><div><b>在其他影视源中查找《{movie.title}》</b><span>不会切换当前源，只搜索其他已启用影视源；找到后可直接进入对应来源的详情。</span></div></div>
 <SectionTitle title="来源选择"/><div className="chips">{sourceIds.length?sourceIds.map(id=><button className={sourceId===id?'active':''} key={id} onClick={()=>setSourceId(id)}>{sourceMap.get(id)||id}</button>):<span>暂无来源</span>}</div>
 {otherSourceSearchOpen&&<OtherSourceSearchDialog title={movie.title} currentSourceId={sourceId} sources={sources} onClose={()=>setOtherSourceSearchOpen(false)} onMovie={onMovie} onPlay={onPlay}/>}
 <SectionTitle title="相关推荐"/>{related.length?<MovieGrid movies={related} onMovie={onMovie}/>:<MovieEmpty compact text="暂无相关推荐"/>}</Page>;
}

function OtherSourceSearchDialog({title,currentSourceId,sources=[],onClose,onMovie,onPlay}){
 const [results,setResults]=useState([]);
 const [failed,setFailed]=useState([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
   const controller=new AbortController();
   let active=true;
   setLoading(true); setError(''); setResults([]); setFailed([]);
   const otherSources=sources.filter(source=>source?.sourceType==='movie'&&source?.enabled!==false&&source.sourceId!==currentSourceId);
   if(!otherSources.length){
     setLoading(false);
     setError('暂无其他已启用影视源可搜索');
     return ()=>{active=false;controller.abort();};
   }
   searchMovieSources(otherSources,title,{signal:controller.signal,pageSize:12,timeoutMs:4500,onSourceResult:(entry)=>{
       if(!active)return;
       if(entry.status==='fulfilled') setResults(current=>[...current,entry]);
       else setFailed(current=>[...current,entry]);
     }})
     .then(result=>{
       if(!active)return;
       setResults(result.results??[]);
       setFailed(result.failed??[]);
     })
     .catch(err=>{
       if(!active || err?.name==='AbortError')return;
       setError(err?.message||'搜索失败');
     })
     .finally(()=>{if(active)setLoading(false);});
   return ()=>{active=false;controller.abort();};
 },[title,currentSourceId,sources]);

 const total=results.reduce((sum,item)=>sum+(item.items?.length??0),0);
 return <div className="modal-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose()}}>
   <div className="modal" style={{maxWidth:560,maxHeight:'82vh',overflow:'auto'}}>
     <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
       <div><b>其他源搜索</b><span style={{display:'block',fontSize:12,color:'#8f9aaa',marginTop:4}}>同名：{title}</span></div>
       <button className="icon-button" aria-label="关闭" onClick={onClose}><X size={18}/></button>
     </div>
     <div className="info-card" style={{marginTop:12,marginBottom:12,padding:10}}>
       <Search size={15}/>
       <span style={{fontSize:11}}>已启用影视源逐个搜索，当前源不会重复搜索；每个源返回后立即显示。</span>
     </div>
     {loading&&<div className="empty compact"><span>正在搜索其他影视源…</span></div>}
     {!loading&&error&&<div className="empty compact"><span>{error}</span></div>}
     {!loading&&!error&&total===0&&<div className="empty compact"><span>没有找到《{title}》的其他来源</span></div>}
     {!loading&&!error&&results.filter(item=>(item.items?.length??0)>0).map(group=>
       <section key={group.sourceId} style={{marginBottom:14}}>
         <div className="section-title" style={{marginBottom:7}}><h3>{group.sourceName}</h3><span style={{fontSize:12,color:'#8f9aaa'}}>{group.items.length} 条</span></div>
         <div style={{display:'grid',gap:8}}>
           {group.items.map(item=><button className="menu" key={item.contentId} onClick={()=>{if(onPlay) onPlay(item,0,item?.sourceId,'detail'); else onMovie(item)}} style={{width:'100%',textAlign:'left'}}>
             <SmartImage src={item.poster} alt={item.title}/>
             <span style={{minWidth:0,flex:1}}><b>{item.title}</b><small>{item.year||'—'} · {item.category||'—'}{item.episodeCount?' · '+item.episodeCount+'集':''}</small></span>
             <ChevronRight size={17}/>
           </button>)}
         </div>
       </section>
     )}
     {!loading&&failed.length>0&&<div style={{fontSize:11,color:'#8f9aaa',paddingTop:4}}>另有 {failed.length} 个源未返回结果，已跳过，不影响其他源结果。</div>}
     <div className="actions" style={{marginTop:12}}><button className="secondary" onClick={onClose}>关闭</button></div>
   </div>
 </div>;
}

const Page=({children})=><main className="page">{children}</main>;
const Header=({title,action})=><header><div><span className="eyebrow">TVBOX REACT</span><h2>{title}</h2></div>{action}</header>;
const SectionTitle=({title,action,onAction})=><div className="section-title"><h3>{title}</h3>{action&&<button onClick={onAction}>{action}</button>}</div>;
const MovieGrid=React.memo(function MovieGrid({movies,onMovie}){return <div className="movie-grid">{movies.map(movie=><article className="movie-card" key={movie.contentId} onClick={()=>onMovie(movie)}><SmartImage src={movie.poster} alt={movie.title} loading="lazy" decoding="async"/><div><b>{movie.title}</b><span>{movie.year} · {movie.category}</span></div></article>)}</div>});
const MovieEmpty=({text,compact,onBack})=><div className={compact?'empty compact':'empty'}>{onBack&&<button className="back" onClick={onBack}><ChevronLeft/>返回</button>}<Film size={22}/><span>{text}</span></div>;
