import { PlayerState, createPlayerCapabilities, createPlayerAdapterContract } from './playerInterface.js';

const protocolType = {
  hls: 'application/x-mpegURL',
  dash: 'application/dash+xml',
  mp4: 'video/mp4',
  ts: 'video/mp2t',
  flv: 'video/x-flv',
};

export function createHtml5PlayerAdapter(video, hooks = {}) {
  if (!video) throw new Error('PLAYER_ELEMENT_REQUIRED');

  let state = PlayerState.IDLE;
  let input = null;
  let released = false;

  const emit = (event, data = {}) => hooks.onEvent?.({ event, ...data });

  const onLoadStart = () => { state = PlayerState.LOADING; emit('loading'); };
  const onWaiting = () => { state = PlayerState.BUFFERING; emit('buffering'); };
  const onCanPlay = () => { state = PlayerState.PREPARING; emit('prepared'); };
  const onPlaying = () => { state = PlayerState.PLAYING; emit('playing'); };
  const onPause = () => {
    if (state !== PlayerState.COMPLETED && state !== PlayerState.STOPPED && !released) {
      state = PlayerState.PAUSED;
      emit('paused');
    }
  };
  const onTimeUpdate = () => emit('progress', { currentTime: video.currentTime, duration: video.duration });
  const onEnded = () => { state = PlayerState.COMPLETED; emit('completed'); };
  const onError = () => {
    state = PlayerState.ERROR;
    emit('error', { nativeError: video.error });
  };

  const bind = () => {
    video.addEventListener('loadstart', onLoadStart);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
  };

  const unbind = () => {
    video.removeEventListener('loadstart', onLoadStart);
    video.removeEventListener('waiting', onWaiting);
    video.removeEventListener('canplay', onCanPlay);
    video.removeEventListener('playing', onPlaying);
    video.removeEventListener('pause', onPause);
    video.removeEventListener('timeupdate', onTimeUpdate);
    video.removeEventListener('ended', onEnded);
    video.removeEventListener('error', onError);
  };

  bind();

  const adapter = {
    get capabilities() { return createPlayerCapabilities(video); },
    load(nextInput) {
      if (released) throw new Error('PLAYER_ADAPTER_RELEASED');
      input = nextInput;
      state = PlayerState.LOADING;
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.src = nextInput.url;
      if (nextInput.playerHint?.autoplay !== false) video.autoplay = true;
      if (nextInput.headers && Object.keys(nextInput.headers).length) {
        emit('requestContextIgnored', { reason: 'HTML5_VIDEO_CANNOT_SET_HEADERS' });
      }
      video.load();
      return input;
    },
    prepare() {
      if (!input) throw new Error('PLAYER_INPUT_REQUIRED');
      state = PlayerState.PREPARING;
      video.load();
      return input;
    },
    play() {
      if (!input) throw new Error('PLAYER_INPUT_REQUIRED');
      const result = video.play();
      return result ?? Promise.resolve();
    },
    pause() {
      video.pause();
      return true;
    },
    seek(seconds) {
      if (!Number.isFinite(seconds)) return false;
      if (!Number.isFinite(video.duration) && !video.seekable?.length) return false;
      video.currentTime = Math.max(0, seconds);
      return video.currentTime;
    },
    stop() {
      video.pause();
      video.removeAttribute('src');
      video.load();
      state = PlayerState.STOPPED;
      emit('stopped');
    },
    setVolume(value) {
      const next = Math.min(1, Math.max(0, Number(value)));
      if (!Number.isFinite(next)) return video.volume;
      video.volume = next;
      return video.volume;
    },
    getState() {
      return { state, input, currentTime: video.currentTime, duration: video.duration };
    },
    release() {
      if (released) return;
      released = true;
      unbind();
      video.pause();
      video.removeAttribute('src');
      video.load();
      state = PlayerState.RELEASED;
      emit('released');
    },
  };

  return createPlayerAdapterContract(adapter);
}
