import React, { useEffect, useRef } from 'react';
import { playbackRuntime } from '../../playback/playbackRuntime.js';

export function PersistentLivePlayerHost() {
  const hostRef = useRef(null);

  useEffect(() => {
    if (typeof document === 'undefined' || !hostRef.current) return undefined;
    const video = document.createElement('video');
    video.className = 'sangtian-video-element';
    video.setAttribute('playsinline', '');
    video.setAttribute('preload', 'metadata');
    video.controls = false;
    Object.assign(video.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'contain', background: '#000' });
    hostRef.current.appendChild(video);
    playbackRuntime.registerLivePlayerElement(video, hostRef.current);
    return () => playbackRuntime.unregisterLivePlayerElement(video);
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      data-persistent-live-player-host="true"
      style={{
        position: 'fixed',
        width: 1,
        height: 1,
        left: 0,
        bottom: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity: 0,
      }}
    />
  );
}
