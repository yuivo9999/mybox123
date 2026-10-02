import { ContentType, normalizeContent } from '../models/content';
import { normalizeChannel } from '../models/live';

const posters = [
  'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600',
  'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=600',
  'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=600',
  'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=600',
  'https://images.unsplash.com/photo-1512070679279-c2f999098c01?w=600',
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=600',
];

export const sourceConfigs = [
  { sourceId: 'demo-movie', name: 'Demo 影视源', sourceType: 'movie', sourceRef: 'demo://movie', enabled: true, status: '正常', order: 1, lastUsedAt: null },
  { sourceId: 'demo-live', name: 'Demo Live 源', sourceType: 'live', sourceRef: 'demo://live', enabled: true, status: '正常', order: 1, lastUsedAt: null },
];

const movieSpecs = [
  ['m1','午夜档案','2026','悬疑','一场失踪案将年轻记者带进城市最隐秘的午夜世界。',['正片']],
  ['m2','星际回声','2025','科幻','远航任务收到来自未知深空的重复讯号。',['第1集','第2集','第3集','第4集']],
  ['m3','夏日以后','2024','剧情','一群老朋友在多年后重新回到海边小城。',['正片']],
  ['m4','城市边缘','2026','犯罪','警探与线人之间的信任，在一次交易后彻底崩塌。',['第1集','第2集','第3集','第4集','第5集']],
  ['m5','深海来信','2023','纪录','记录深海研究团队的一次远洋科考。',['正片']],
  ['m6','最后一站','2025','动作','列车停在无人站台，乘客必须找出离开的办法。',['正片']],
];

export const movies = movieSpecs.map(([sourceItemId,title,year,category,description,episodes], index) => normalizeContent({
  sourceId: 'demo-movie', sourceItemId, title, year, category, description,
  type: episodes.length > 1 ? ContentType.SERIES : ContentType.MOVIE,
  poster: posters[index],
  episodes: episodes.map((episodeTitle, episodeIndex) => ({
    title: episodeTitle,
    playbackCandidates: [{
      sourceId: 'demo-movie',
      mediaUrl: 'https://storage.googleapis.com/coverr-main/mp4/Mt_Baker.mp4',
      protocol: 'mp4',
      label: '演示线路',
      priority: 0,
      metadata: { demo: true, episodeIndex },
    }],
  })),
}));

export const channels = [
  normalizeChannel({sourceId:'demo-live',sourceItemId:'c1',name:'News One',category:'新闻',streams:[{url:'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',label:'主线路'}]}),
  normalizeChannel({sourceId:'demo-live',sourceItemId:'c2',name:'World Live',category:'综合',streams:[{url:'https://test-streams.mux.dev/test_001/stream.m3u8',label:'线路 A'}]}),
  normalizeChannel({sourceId:'demo-live',sourceItemId:'c3',name:'Sports Hub',category:'体育',streams:[{url:'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',label:'线路 A'}]}),
  normalizeChannel({sourceId:'demo-live',sourceItemId:'c4',name:'Music 24',category:'音乐',streams:[{url:'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',label:'线路 A'}]}),
];
