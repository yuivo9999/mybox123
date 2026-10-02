import React from 'react';
import { SmartImage } from '../StateViews.jsx';

export const MovieCard = React.memo(function MovieCard({ movie, onClick }) {
  return <article className="movie-card" onClick={() => onClick?.(movie)}>
    <SmartImage src={movie?.poster} alt={movie?.title ?? ''} loading="lazy" decoding="async" />
    <div><b>{movie?.title ?? '未命名'}</b><span>{movie?.year ?? ''}{movie?.category ? ` · ${movie.category}` : ''}</span></div>
  </article>;
});
