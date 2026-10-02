import { PlayerState, PlayerCapability, createPlayerAdapterContract } from './playerInterface.js';

function getBridge() {
 if(typeof window==='undefined') return null;
 return [window.TVBoxAndroidBridge,window.Android,window.tvboxBridge].find(x=>x&&typeof x==='object')??null;
}
function call(method,payload={}) {
 const bridge=getBridge();
 if(!bridge||typeof bridge[method]!=='function') throw new Error('NATIVE_PLAYER_BRIDGE_UNAVAILABLE');
 const value=bridge[method](JSON.stringify(payload));
 return value&&typeof value.then==='function'?value:Promise.resolve(value);
}
export function createNativePlayerAdapter(hooks={}) {
 let state=PlayerState.IDLE,input=null,released=false,capabilities=Object.freeze({
  [PlayerCapability.SEEK]:true,[PlayerCapability.VOLUME]:true,[PlayerCapability.PAUSE]:true,
  [PlayerCapability.AUTOPLAY]:true,[PlayerCapability.CUSTOM_HEADERS]:true,[PlayerCapability.COOKIES]:true,
  [PlayerCapability.AUDIO_TRACKS]:true,[PlayerCapability.SUBTITLE_TRACKS]:true,
  [PlayerCapability.TRACK_SELECTION]:true,[PlayerCapability.QUALITY_SELECTION]:true,
  [PlayerCapability.LIVE_RECONNECT]:true,
 });
 const emit=(event,data={})=>hooks.onEvent?.({event,...data});
 const adapter={
  get capabilities(){return capabilities;},
  load(next){if(released)throw new Error('PLAYER_ADAPTER_RELEASED');input=next;state=PlayerState.LOADING;emit('loading');return call('loadMedia',{url:next.url,headers:next.headers??{},cookies:next.cookies??'',referer:next.referer??'',userAgent:next.userAgent??'',token:next.token,protocol:next.protocol,playerHint:next.playerHint}).then(()=>input);},
  prepare(){if(!input)throw new Error('PLAYER_INPUT_REQUIRED');state=PlayerState.PREPARING;emit('prepared');return call('prepareMedia',{});},
  play(){if(!input)throw new Error('PLAYER_INPUT_REQUIRED');return call('playMedia',{});},
  pause(){return call('pauseMedia',{});},
  seek(seconds){return call('seekMedia',{seconds});},
  stop(){state=PlayerState.STOPPED;emit('stopped');return call('stopMedia',{});},
  setVolume(value){return call('setVolume',{value});},
  getState(){return {state,input};},
  getAudioTracks(){return call('getAudioTracks',{});},
  getSubtitleTracks(){return call('getSubtitleTracks',{});},
  selectAudioTrack(trackId){return call('selectAudioTrack',{trackId});},
  selectSubtitleTrack(trackId){return call('selectSubtitleTrack',{trackId});},
  getQualities(){return call('getQualities',{});},
  selectQuality(qualityId){return call('selectQuality',{qualityId});},
  release(){if(released)return;released=true;state=PlayerState.RELEASED;emit('released');return call('releaseMedia',{}).catch(()=>undefined);},
 };
 return createPlayerAdapterContract(adapter);
}
