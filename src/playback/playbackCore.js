import { PlaybackFailureCode, PlaybackKind } from '../models/playback.js';
import { parserService } from '../parsers/parserService.js';
import { createHtml5PlayerAdapter } from '../player/html5PlayerAdapter.js';
import { createNativePlayerAdapter } from '../player/nativePlayerAdapter.js';
import { PlayerState } from '../player/playerInterface.js';
import { createPlaybackEventBus } from './playbackEventBus.js';
import { createPlaybackStateMachine } from './playbackStateMachine.js';
import { createPlaybackNetworkPolicy } from './playbackNetworkPolicy.js';
import { classifyPlaybackError } from './playbackErrorPolicy.js';
import { playbackResourceManager } from './playbackResourceManager.js';
import { playbackTaskRegistry } from './playbackTaskRegistry.js';
import { playbackSessionManager } from './playbackSessionManager.js';
import { ErrorCode } from '../models/errors.js';
import { errorService } from '../services/errorService.js';
import { normalizePlaybackEvent } from './playbackEventProtocol.js';
import { userDataService } from '../services/userDataService.js';

function nativeAvailable() {
  if (typeof window === 'undefined') return false;
  const bridge=[window.TVBoxAndroidBridge,window.Android,window.tvboxBridge].find(x=>x&&typeof x==='object');
  return Boolean(bridge && typeof bridge.loadMedia==='function');
}

export function createPlaybackCore(task,hooks={}) {
 let player=null,playerElement=null,resourceRelease=null,sessionId=null,released=false,operationGeneration=0,playerGeneration=0,activePlayerOperationGeneration=null;
 const isCurrentOperation=(generation)=>!released&&generation===operationGeneration;
 const eventBus=createPlaybackEventBus();
 const stateMachine=createPlaybackStateMachine(task.request.kind??PlaybackKind.VOD);
 const networkPolicy=createPlaybackNetworkPolicy(hooks.networkPolicy);
 const unsubscribe=task.subscribe(e=>{const normalized=normalizePlaybackEvent(e);eventBus.emit(normalized);hooks.onEvent?.(normalized);});

 const transition=(next)=>{try{stateMachine.transition(next);}catch{stateMachine.reset();if(next!==PlayerState.IDLE)try{stateMachine.transition(next);}catch{}}hooks.onStateChange?.(stateMachine.state);emit('stateChanged',{state:stateMachine.state});return stateMachine.state;};
 const emit=(event,data={})=>{const normalized=normalizePlaybackEvent({event,requestId:task.request.requestId,taskId:task.request.taskId,...data});return eventBus.emit(normalized);};

 const handlePlayerEvent=(event,eventGeneration=playerGeneration)=>{
  if(released||eventGeneration!==playerGeneration||activePlayerOperationGeneration!==operationGeneration)return;
  if(event.event==='loading')transition(PlayerState.LOADING);
  if(event.event==='prepared')transition(PlayerState.PREPARING);
  if(event.event==='playing'){transition(PlayerState.PLAYING);networkPolicy.resetRetry();}
  if(event.event==='paused')transition(PlayerState.PAUSED);
  if(event.event==='bufferingStart'){transition(PlayerState.BUFFERING);emit('bufferingStart');}
  if(event.event==='bufferingEnd'){if(task.request.kind===PlaybackKind.LIVE)transition(PlayerState.PLAYING);else if(stateMachine.state===PlayerState.BUFFERING)transition(PlayerState.PLAYING);emit('bufferingEnd');}
  if(event.event==='buffering')transition(PlayerState.BUFFERING);
  if(event.event==='qualityChanged')emit('qualityChanged',event);
  if(event.event==='decoderChanged')emit('decoderChanged',{decoder:event.data??event});
  if(event.event==='episodeChanged')emit('episodeChanged',event);
  if(event.event==='reconnecting')transition(PlayerState.RECONNECTING);
  if(event.event==='completed'&&task.request.kind===PlaybackKind.VOD)transition(PlayerState.COMPLETED);
  if(event.event==='stopped')transition(PlayerState.STOPPED);
  if(event.event==='released')transition(PlayerState.RELEASED);
  if(event.event==='progress'&&task.request.kind===PlaybackKind.VOD)emit('progress',{currentTime:event.currentTime,duration:event.duration});
  if(event.event==='sourceChanged')emit('sourceChanged',{candidate:event.candidate});
  if(event.event==='error'){
   const code=classifyPlaybackError(event.nativeError,{code:event.nativeError?.message});
   const normalized=errorService.normalize(event.nativeError??new Error('MEDIA_LOAD_ERROR'),{code:code===PlaybackFailureCode.NETWORK?ErrorCode.NETWORK:ErrorCode.PLAYBACK,context:{scope:'playback',taskId:task.request.taskId,requestId:task.request.requestId,candidateId:task.currentCandidateId},retryable:code===PlaybackFailureCode.NETWORK});
   void recover(normalized,code,operationGeneration);
  }
  if(event.event==='requestContextIgnored')hooks.onPlayerWarning?.(event);
 };

 const attachPlayer=(element)=>{
  playerGeneration+=1;
  const currentPlayerGeneration=playerGeneration;
  activePlayerOperationGeneration=operationGeneration;
  player?.release?.(); playerElement=element;
  if(nativeAvailable()) player=createNativePlayerAdapter({onEvent:(event)=>handlePlayerEvent(event,currentPlayerGeneration)});
  else if(element) player=createHtml5PlayerAdapter(element,{onEvent:(event)=>handlePlayerEvent(event,currentPlayerGeneration)});
  else return null;
  return player;
 };

 const resolve=async(candidate=task.currentCandidate,options={})=>{
  const operationToken=options.__operationGeneration;
  if(!candidate||released||(operationToken!=null&&!isCurrentOperation(operationToken)))return null;
  // Live 使用源提供的原始 mediaUrl，完全跳过影视解析器链。
  if(task.request.kind===PlaybackKind.LIVE){
   const directInput={
    ...candidate,
    url:candidate.mediaUrl,
    mediaUrl:candidate.mediaUrl,
    session:null,
    parserSkipped:true,
    playerHint:{autoplay:true,...(candidate.playerHint??{})},
   };
   if(operationToken!=null&&!isCurrentOperation(operationToken))return null;
   hooks.onResolvedInput?.(directInput);
   return directInput;
  }
  if(sessionId)playbackSessionManager.clear(sessionId);
  sessionId=playbackSessionManager.create(candidate);
  try{
   const resolved=await parserService.resolve({...candidate,session:{sessionId}}, {...options,sessionManager:playbackSessionManager});
   if(operationToken!=null&&!isCurrentOperation(operationToken))return null;
   hooks.onResolvedInput?.(resolved);
   return resolved;
  }catch(error){
   const code=classifyPlaybackError(error,{code:error?.message,fromParser:true});
   const normalized=errorService.normalize(error,{code:error?.message?.includes('SessionExpired')?ErrorCode.PLAYBACK:ErrorCode.PARSE,context:{scope:'parser',taskId:task.request.taskId,requestId:task.request.requestId,candidateId:candidate.candidateId}});
   hooks.onParserError?.({candidate,error:normalized,code});
   emit('error',{candidateId:candidate.candidateId,code,error:normalized.message});
   const failureCode=code===PlaybackFailureCode.NETWORK?PlaybackFailureCode.NETWORK:code===PlaybackFailureCode.EXPIRED?PlaybackFailureCode.EXPIRED:PlaybackFailureCode.PARSER;
   if(!released && task.currentCandidateId===candidate.candidateId && (operationToken==null || isCurrentOperation(operationToken))) failAndResolve(normalized,failureCode);
   return null;
  }
 }

 const playResolved=async(input,generation=operationGeneration)=>{
  if(!isCurrentOperation(generation))return null;
  const activePlayer=player;
  if(!activePlayer)throw new Error('PLAYER_ADAPTER_NOT_ATTACHED');
  const playbackSettings = userDataService.getSettings().playback;
  const defaultEngine = task.request.kind === PlaybackKind.LIVE ? playbackSettings.livePlayer : playbackSettings.moviePlayer;
  const playerHint = {
   ...(input.playerHint ?? {}),
   engine: input.playerHint?.engine ?? defaultEngine,
   decoder: input.playerHint?.decoder ?? playbackSettings.decoder?.[defaultEngine] ?? 'auto',
   decoderModes: input.playerHint?.decoderModes ?? playbackSettings.decoder ?? {},
   fallbackEnabled: input.playerHint?.fallbackEnabled ?? playbackSettings.fallbackEnabled,
   fallbackOrder: input.playerHint?.fallbackOrder ?? playbackSettings.fallbackOrder,
   live: task.request.kind === PlaybackKind.LIVE,
   ijkProfiles: input.playerHint?.ijkProfiles ?? input.metadata?.tvboxIJKProfiles ?? {},
   ijkProfile: input.playerHint?.ijkProfile ?? (
    (input.playerHint?.decoder ?? playbackSettings.decoder?.ijk ?? 'auto') === 'software' ? '软解码' :
    (input.playerHint?.decoder ?? playbackSettings.decoder?.ijk ?? 'auto') === 'hardware' ? '硬解码' :
    undefined
   ),
  };
  await Promise.resolve(activePlayer.load({ ...input, playerHint }));
  if(!isCurrentOperation(generation))return null;
  await Promise.resolve(activePlayer.prepare());
  if(!isCurrentOperation(generation))return null;
  const startPosition=Number(task.request.metadata?.startPositionSeconds??0);
  if(task.request.kind===PlaybackKind.VOD&&startPosition>0)activePlayer.seek(startPosition);
  if(!isCurrentOperation(generation))return null;
  if(input.playerHint?.autoplay!==false)await activePlayer.play();
  if(!isCurrentOperation(generation))return null;
  return input;
 };

 const resolveAndLoad=async(candidate=task.currentCandidate,options={})=>{
  const generation=operationGeneration;
  const input=await resolve(candidate,{...options,__operationGeneration:generation});
  if(!input||!isCurrentOperation(generation))return null;
  await playResolved(input,generation);
  if(!isCurrentOperation(generation))return null;
  networkPolicy.resetRetry();
  return input;
 };

 const failAndResolve=(error,code=PlaybackFailureCode.UNKNOWN)=>{
  const classified=classifyPlaybackError(error,{code});const next=task.fail(error,classified);hooks.onCandidateChange?.(next);networkPolicy.resetRetry();
  if(!next){hooks.onExhausted?.(task);return null;}
  transition(PlayerState.LOADING);void resolveAndLoad(next).catch(e=>hooks.onPlayerError?.({error:e,candidate:next}));return next;
 };

 async function recover(error,code,generation=operationGeneration){
  if(!isCurrentOperation(generation))return false;
  if(task.request.kind===PlaybackKind.LIVE && networkPolicy.shouldReconnect({code})){
   transition(PlayerState.RECONNECTING);emit('reconnecting',{candidate:task.currentCandidate,reconnectCount:networkPolicy.reconnectCount});
   await new Promise(r=>setTimeout(r,networkPolicy.getReconnectDelay()));
   if(!isCurrentOperation(generation))return false;
   try{await resolveAndLoad(task.currentCandidate);return isCurrentOperation(generation);}catch{}
  }
  if(networkPolicy.shouldRetry({code})){
   const candidate=task.retry({maxRetries:networkPolicy.retryCount+1});
   if(candidate){emit('retry',{candidate,retryCount:networkPolicy.retryCount});if(!isCurrentOperation(generation))return false;try{await resolveAndLoad(candidate);return isCurrentOperation(generation);}catch{}}
  }
  if(!isCurrentOperation(generation))return false;
  failAndResolve(error,code);return false;
 }

 return {
  get request(){return task.request;},get task(){return task;},get state(){return stateMachine.state;},get capabilities(){return player?.capabilities??{};},get currentPlayer(){return player;},getVideoElement(){return playerElement;},
  getPlaybackState(){
   const element=playerElement;
   return {state:stateMachine.state,currentTime:Number(element?.currentTime)||0,duration:Number.isFinite(Number(element?.duration))?Number(element.duration):0,paused:element?Boolean(element.paused):stateMachine.state!==PlayerState.PLAYING,ended:element?Boolean(element.ended):stateMachine.state===PlayerState.COMPLETED,readyState:Number(element?.readyState)||0,playbackRate:Number(element?.playbackRate)||1,volume:Number.isFinite(Number(element?.volume))?Number(element.volume):1};
  },
  getBufferState(){
   const element=playerElement;let forward=0;
   try{if(element?.buffered?.length){const current=Number(element.currentTime)||0;const end=element.buffered.end(element.buffered.length-1);forward=Math.max(0,end-current);}}catch{}
   return {forwardSeconds:forward};
  },
  subscribe(listener){return eventBus.subscribe(listener);},attachPlayer,
  start(){
   if(released)throw new Error('PLAYBACK_CORE_RELEASED');
   playbackTaskRegistry.register({request:task.request,stop:()=>{try{player?.stop?.();}finally{task.stop?.();}},release:()=>{try{player?.release?.();}finally{task.release?.();}}});
   resourceRelease?.();
   resourceRelease=playbackResourceManager.acquire(task.request.taskId,task.request.kind,(previous)=>hooks.onResourceReplaced?.(previous));
   // stop() deliberately keeps the adapter/resource ownership so the same controller can be
   // restarted. Rebind the player callback after stop so events from the restarted session are
   // accepted by the new operation generation.
   if (activePlayerOperationGeneration === null) attachPlayer(playerElement);
   const initial=task.start();if(initial)transition(PlayerState.LOADING);return initial;
  },
  async resolveAndLoad(candidate=task.currentCandidate,options={}){return resolveAndLoad(candidate,options);},
  resolve,
  setVideoViewBounds(bounds){return player?.setVideoViewBounds?.(bounds) ?? false;},
  setPlaybackRate(rate){const value=Number(rate);if(!Number.isFinite(value)||value<=0)return false;if(player?.setPlaybackRate)return player.setPlaybackRate(value);if(playerElement){playerElement.playbackRate=value;return true;}return false;},
  setVolume(v){return player?.setVolume?.(v) ?? (playerElement ? (playerElement.volume=Math.max(0,Math.min(1,Number(v)||0)),true) : false);},
  seek(s){return player?.seek?.(s) ?? (playerElement ? (playerElement.currentTime=Number(s)||0,true) : false);},
  attachPresentation(target){if(target&&playerElement&&playerElement.parentNode!==target)target.appendChild(playerElement);return playerElement;},
  detachPresentation(){return playerElement;},
  async play(){if(!player)throw new Error('PLAYER_ADAPTER_NOT_ATTACHED');return player.play();},
  pause(){return player?.pause();},
  getAudioTracks(){return player?.getAudioTracks?.()??[];},getSubtitleTracks(){return player?.getSubtitleTracks?.()??[];},selectAudioTrack(id){return player?.selectAudioTrack?.(id)??false;},selectSubtitleTrack(id){return player?.selectSubtitleTrack?.(id)??false;},getQualities(){return player?.getQualities?.()??[];},selectQuality(id){return player?.selectQuality?.(id)??false;},
  markPlaying(){return task.markPlaying();},
  retry(options={}){if(!networkPolicy.shouldRetry({code:options.code??'network'}))return null;const candidate=task.retry(options);if(candidate)void resolveAndLoad(candidate);return candidate;},
  fail(error,code=PlaybackFailureCode.UNKNOWN){return failAndResolve(error,code);},
  replaceLiveCandidates(candidates=[],metadata={}){
   if(task.request.kind!==PlaybackKind.LIVE)return null;
   operationGeneration+=1;
   const next=task.replaceCandidates(candidates,{channelId:metadata.channelId,metadata});
   if(next){transition(PlayerState.LOADING);void resolveAndLoad(next).catch(e=>hooks.onPlayerError?.({error:e,candidate:next}));}
   return next;
  },
  switchCandidate(candidateId){operationGeneration+=1;const next=task.switchCandidate(candidateId);hooks.onCandidateChange?.(next);if(next){networkPolicy.reset();attachPlayer(playerElement);transition(PlayerState.LOADING);void resolveAndLoad(next).catch(e=>hooks.onPlayerError?.({error:e,candidate:next}));}return next;},
  switchEpisode(episodeId,candidate=null,startPositionSeconds=0){emit('episodeChanged',{episodeId,startPositionSeconds});if(candidate)return this.switchCandidate(candidate.candidateId);return episodeId;},
  async handleAppState(state){
   if(state==='background'){if(task.request.kind===PlaybackKind.VOD){await player?.pause?.();}else{player?.pause?.();}}
   if(state==='foreground'&&task.request.kind===PlaybackKind.LIVE&&task.currentCandidate){try{await resolveAndLoad(task.currentCandidate);}catch(e){void recover(e,PlaybackFailureCode.NETWORK);}}
  },
  stop(){
   operationGeneration+=1;
   activePlayerOperationGeneration=null;
   player?.stop?.();
   task.stop();
   // Keep the controller registered and resource-owned while stopped. This allows an
   // explicit start()/retry flow to reuse the controller, while a competing controller
   // can still replace it through playbackResourceManager -> taskRegistry -> release.
  },
  release(){if(released)return;operationGeneration+=1;activePlayerOperationGeneration=null;released=true;try{player?.release?.();}finally{player=null;resourceRelease?.();resourceRelease=null;playbackSessionManager.clear(sessionId);sessionId=null;unsubscribe();eventBus.clear();task.release();playbackTaskRegistry.unregister(task.request.taskId);}}
 };
}
