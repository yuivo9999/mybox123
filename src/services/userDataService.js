import { userDataRepository } from '../repositories/userDataRepository.js';
function shouldWriteProgress(previous, next) {
  if (!previous) return true;
  if (previous.completed && !next.completed && next.positionSeconds <= previous.positionSeconds) return false;
  if (!next.completed && next.positionSeconds === 0 && previous.positionSeconds > 0) return false;
  return next.updatedAt >= previous.updatedAt;
}
export const userDataService = {
  getSettings() { return userDataRepository.getSettings(); },
  saveSettings(value) { userDataRepository.saveSettings(value); return value; },
  getSnapshot() { return { favorites:userDataRepository.getFavorites(), history:userDataRepository.getHistory(), progress:userDataRepository.getProgress(), searches:userDataRepository.getSearches(), settings:userDataRepository.getSettings(), selectedSources:userDataRepository.getSelectedSources(), migration:userDataRepository.getMigrationState() }; },
  toggleFavorite(targetType, targetId) {
    if (!targetType || targetId == null) return userDataRepository.getFavorites();
    const current=userDataRepository.getFavorites();
    const exists=current.some((item)=>item.targetType===targetType&&item.targetId===targetId);
    const next=exists?current.filter((item)=>!(item.targetType===targetType&&item.targetId===targetId)):[...current,{favoriteId:userDataRepository.ids.createFavoriteId(targetType,targetId),targetType,targetId,createdAt:Date.now(),lastAccessedAt:Date.now()}];
    userDataRepository.saveFavorites(next); return next;
  },
  recordMoviePlay(content, episodeIndex=0) {
    const episode=content?.episodes?.[episodeIndex]??null; if(!content?.contentId)return userDataRepository.getHistory();
    const episodeId=episode?.episodeId??''; const sourceRef=episode?.sourceRefs?.[0]??content.sourceRefs?.[0]??{};
    const progress=userDataRepository.getProgress().find((item)=>item.contentId===content.contentId&&item.episodeId===episodeId);
    const historyItem={historyId:userDataRepository.ids.createHistoryId('content',content.contentId,episodeId),targetType:'content',targetId:content.contentId,episodeId,sourceId:sourceRef.sourceId??null,sourceItemId:sourceRef.sourceItemId??null,lastPlayedAt:Date.now(),completed:Boolean(progress?.completed),positionSeconds:progress?.positionSeconds??0,durationSeconds:progress?.durationSeconds??null};
    const history=[historyItem,...userDataRepository.getHistory().filter((item)=>item.historyId!==historyItem.historyId)].slice(0,50);
    userDataRepository.saveHistory(history); return history;
  },
  recordLivePlay(channel, streamId=null) {
    if(!channel?.channelId)return userDataRepository.getHistory();
    const selectedStream=channel.streams?.find((stream)=>stream.streamId===streamId)??channel.streams?.[0]??null;
    const historyItem={historyId:userDataRepository.ids.createHistoryId('channel',channel.channelId),targetType:'channel',targetId:channel.channelId,streamId:selectedStream?.streamId??null,sourceId:selectedStream?.sourceId??channel.sourceRefs?.[0]?.sourceId??null,sourceChannelId:channel.sourceRefs?.[0]?.sourceChannelId??null,lastPlayedAt:Date.now(),completed:false};
    const history=[historyItem,...userDataRepository.getHistory().filter((item)=>item.historyId!==historyItem.historyId)].slice(0,50);
    userDataRepository.saveHistory(history); return history;
  },
  recordProgress(contentId,episodeId,positionSeconds,durationSeconds=null,completed=false) {
    if(!contentId)return userDataRepository.getProgress();
    const current=userDataRepository.getProgress(); const progressId=userDataRepository.ids.createProgressId(contentId,episodeId); const previous=current.find((item)=>item.progressId===progressId)??null;
    const position=Math.max(0,Number(positionSeconds)||0), duration=durationSeconds==null?null:Math.max(0,Number(durationSeconds)||0);
    const progressItem={progressId,contentId,episodeId:episodeId??'',positionSeconds:position,durationSeconds:duration,updatedAt:Date.now(),completed:Boolean(completed)};
    if(!shouldWriteProgress(previous,progressItem))return current;
    const progress=[progressItem,...current.filter((item)=>item.progressId!==progressId)].slice(0,100); userDataRepository.saveProgress(progress);
    const history=userDataRepository.getHistory().map((item)=>item.targetType==='content'&&item.targetId===contentId&&item.episodeId===(episodeId??'')?{...item,positionSeconds:position,durationSeconds:duration,completed:Boolean(completed),lastPlayedAt:Date.now()}:item);
    userDataRepository.saveHistory(history); return progress;
  },
  removeSearch(searchId) { const next = userDataRepository.getSearches().filter((item) => item.searchId !== searchId); userDataRepository.saveSearches(next); return next; },
  clearSearches() { userDataRepository.saveSearches([]); return []; },
  recordSearch(keyword) {
    const clean=String(keyword??'').trim(); if(!clean)return userDataRepository.getSearches();
    const existing=userDataRepository.getSearches().find((item)=>item.keyword.toLowerCase()===clean.toLowerCase());
    const nextItem={searchId:userDataRepository.ids.createSearchId(clean),keyword:clean,searchedAt:Date.now(),count:(existing?.count??0)+1};
    const searches=[nextItem,...userDataRepository.getSearches().filter((item)=>item.searchId!==nextItem.searchId)].slice(0,20); userDataRepository.saveSearches(searches); return searches;
  },
  clearUserData(){userDataRepository.clearUserData();return this.getSnapshot();},
};
