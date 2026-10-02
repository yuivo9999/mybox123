import React, { useEffect } from 'react';
import { Home, Film, Radio, Heart, User } from 'lucide-react';
import { movies as normalizedMovies, channels as normalizedChannels } from '../data/demoData';
import { contentService } from '../services/contentService';
import { liveService } from '../services/liveService';
import { playbackService } from '../services/playbackService';
import { cacheService } from '../services/cacheService.js';
import { usePersistentState } from '../state/usePersistentState.js';
import { useSessionState } from '../state/useSessionState.js';
import { sessionStateStore } from '../state/sessionStateStore.js';
import { pageStateStore } from '../state/pageStateStore.js';
import { MovieFeature } from '../features/movie/MovieFeature.jsx';
import { LiveFeature, LiveChannelPanel } from '../features/live/LiveFeature.jsx';
import { ErrorBoundary } from '../components/ErrorBoundary.jsx';
import { webViewRuntime } from '../runtime/webViewRuntime.js';
import { MainPage } from '../pages/MainPage.jsx';
import { PlaybackPage } from '../pages/PlaybackPage.jsx';

const movies=contentService.getMovies(normalizedMovies);
const channels=liveService.getChannels(normalizedChannels);

export function App(){
 const session=useSessionState(); const persistent=usePersistentState(); const {tab,route,selected}=session;
 useEffect(()=>{cacheService.prune();},[]);
 useEffect(()=>webViewRuntime.mount({onBack:()=>{
   if(typeof document!=='undefined'&&document.fullscreenElement){void webViewRuntime.setFullscreen(false);return true}
   if(route==='movie-play'||route==='live-play'){sessionStateStore.patch({route:route==='movie-play'?'detail':'live-channel'});return true}
   if(route==='detail'||route==='live-channel'||route==='search'){sessionStateStore.patch({route:null,selected:null});return true}
   return false;
 },onAppStateChange:(state)=>{if(state==='foreground'&&(route==='movie-play'||route==='live-play'))webViewRuntime.call('getAppState')}}),[route]);

 const openMovie=(movie,routeOverride=null)=>{
   if(routeOverride==='search'){sessionStateStore.patch({tab:'movies',route:'search',selected:null});return}
   if(!movie)return;
   sessionStateStore.patch({selected:movie,route:'detail',tab:'movies'});
 };
 const playMovie=(movie,episodeIndex=0,sourceId=null)=>{
   if(!movie)return;
   const episode=movie.episodes?.[episodeIndex]??movie.episodes?.[0]; if(!episode)return;
   const progress=persistent.progress.find((item)=>item.contentId===movie.contentId&&item.episodeId===episode.episodeId);
   const request=playbackService.createVODRequest({content:movie,episode,episodeIndex,metadata:{title:movie.title,poster:movie.poster,episodeTitle:episode.title??'',sourceId,startPositionSeconds:progress?.completed?0:(progress?.positionSeconds??0)}});
   if(sourceId){
     const sourceCandidates=request.candidates.filter((candidate)=>candidate.sourceId===sourceId);
     if(sourceCandidates.length)request.candidates=sourceCandidates;
   }
   sessionStateStore.patch({selected:request,route:'movie-play',tab:'movies'});
   persistent.recordMoviePlay(movie,episodeIndex);
 };
 const testSource=async(source)=>{if(!source?.url){return;} const current=persistent.sources; const mark=(status)=>persistent.saveSources(current.map(s=>s.sourceId===source.sourceId?{...s,status}:s)); mark('测试中'); try{const response=await fetch(source.url,{method:'GET',mode:'cors'});mark(response.ok?'可用':'不可用')}catch{mark('不可用')}};
 const nav=(key)=>sessionStateStore.patch({tab:key,route:null,selected:null});
 const openSearchHistory=(keyword)=>{pageStateStore.patch('search',{query:keyword});sessionStateStore.patch({tab:'movies',route:'search',selected:null});};
 const openLiveChannel=(channel)=>{if(!channel)return;sessionStateStore.patch({selected:channel,route:'live-channel',tab:'live'})};
 const playLive=(channel,streamId=null)=>{
   if(!channel)return;
   const request=playbackService.createLiveRequest({channel,metadata:{title:channel.name,category:channel.category,channelId:channel.channelId}});
   if(streamId){const index=request.candidates.findIndex((candidate)=>candidate.streamId===streamId);if(index>=0)request.candidates=[request.candidates[index],...request.candidates.filter((_,i)=>i!==index)]}
   sessionStateStore.patch({selected:request,route:'live-play',tab:'live'}); persistent.recordLivePlay(channel,streamId);
 };
 const movieActive=['detail','movie-play','search'].includes(route)||tab==='home'||tab==='movies';
 if(!persistent.settings?.initialized) return <FirstLaunch onLater={()=>persistent.saveSettings({...persistent.settings,initialized:true,initializedAt:Date.now()})} onSources={()=>{persistent.saveSettings({...persistent.settings,initialized:true,initializedAt:Date.now()});nav('sources')}}/>;
 return <div className="app-shell"><div className="screen">
  {movieActive?<MovieFeature route={route} tab={tab} selected={selected} movies={movies} channels={channels} history={persistent.history} favorites={persistent.favorites} onMovie={openMovie} onPlay={playMovie} onTab={nav} onBack={()=>sessionStateStore.patch({route:route==='movie-play'?'detail':null,selected:route==='movie-play'?selected:null})} onLive={playLive} recordSearch={persistent.recordSearch} toggleFavorite={persistent.toggleFavorite}/>
   :route==='live-channel'?<LiveChannelPanel channel={selected} channels={channels} favorites={persistent.favorites} onBack={()=>sessionStateStore.patch({route:null,selected:null,tab:'live'})} onPlay={playLive} onChannel={openLiveChannel} toggleFavorite={persistent.toggleFavorite}/>
   :route==='live-play'?<PlaybackPage request={selected} kind="live" channels={channels} favorites={persistent.favorites} onChannel={openLiveChannel} onPlay={playLive} toggleFavorite={persistent.toggleFavorite} onBack={()=>sessionStateStore.patch({route:'live-channel',selected:channels.find(c=>c.channelId===selected?.channelId)??null})}/>
   :<MainPage tab={tab} movies={movies} channels={channels} favorites={persistent.favorites} history={persistent.history} progress={persistent.progress} sources={persistent.sources} searches={persistent.searches} onTab={nav} onMovie={openMovie} onLive={playLive} onLiveChannel={openLiveChannel} onSearchHistory={openSearchHistory} toggleFavorite={persistent.toggleFavorite} onClearData={persistent.clearUserData} onClearHistory={persistent.clearHistory} onClearSearches={persistent.clearSearches} onRemoveSearch={persistent.removeSearch} onClearCache={persistent.clearCache} onSourceEnabled={persistent.setSourceEnabled} onSourceActive={persistent.setSourceActive} onTestSource={testSource} onSaveSources={persistent.saveSources} onRemoveSource={persistent.removeSource}/>
  }
  {!route&&<BottomNav tab={tab} onTab={nav}/>}
 </div></div>;
}
function BottomNav({tab,onTab}){return <nav>{[['home',Home,'首页'],['movies',Film,'影视'],['live',Radio,'直播'],['favorites',Heart,'收藏'],['me',User,'我的']].map(([key,Icon,label])=><button className={tab===key?'active':''} onClick={()=>onTab(key)} key={key}><Icon size={21} fill={tab===key?'currentColor':'none'}/><span>{label}</span></button>)}</nav>}
export function AppRoot(){return <ErrorBoundary><App/></ErrorBoundary>}

function FirstLaunch({onLater,onSources}){return <div className="app-shell"><div className="screen"><main className="page first-launch"><div className="profile"><div className="avatar">T</div><div><span className="eyebrow">TVBOX REACT</span><h1>欢迎使用</h1><span>当前还没有配置内容源</span></div></div><div className="actions"><button className="primary" onClick={onSources}>去添加源</button><button className="secondary" onClick={onLater}>稍后设置</button></div></main></div></div>}
