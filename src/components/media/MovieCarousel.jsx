import React, { useEffect, useRef } from 'react';
import { Film } from 'lucide-react';
import { SmartImage } from '../StateViews.jsx';

export const MovieCarousel = React.memo(function MovieCarousel({ movies=[], onMovie, ariaLabel='影视列表' }) {
  const ref=useRef(null);
  useEffect(()=>{
    const node=ref.current; if(!node || typeof IntersectionObserver === 'undefined') return;
    const cards=[...node.querySelectorAll('[data-carousel-card]')]; if(!cards.length) return;
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{ entry.target.dataset.active=entry.isIntersecting && entry.intersectionRatio>=.72?'true':'false'; }),{root:node,threshold:[.25,.72,.95]});
    cards.forEach(card=>observer.observe(card)); return()=>observer.disconnect();
  },[movies]);
  return <div className="movie-carousel-wrap">
    <div className="movie-carousel" ref={ref} role="list" aria-label={ariaLabel} data-horizontal-scroll="true">
      {movies.map((movie,index)=><article className="movie-carousel-card" data-carousel-card data-active={index===0?'true':'false'} role="listitem" tabIndex={0} key={movie.contentId||movie.title||index}
        onClick={()=>onMovie?.(movie)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onMovie?.(movie);}}}>
        <div className="movie-carousel-poster"><SmartImage src={movie?.poster} alt={movie?.title??''} loading={index<4?'eager':'lazy'} decoding="async" fallback={<div className="movie-carousel-placeholder"><Film size={22}/></div>}/></div>
        <div className="movie-carousel-caption"><b title={movie?.title??''}>{movie?.title??'未命名'}</b><span>{movie?.year||''}{movie?.category?` · ${movie.category}`:''}</span></div>
      </article>)}
    </div>
    {movies.length>1&&<div className="movie-carousel-hint" aria-hidden="true"><span>左右滑动</span><i/></div>}
  </div>;
});
