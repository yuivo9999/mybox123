function sortProgress(progress = []) {
  return (Array.isArray(progress) ? progress : [])
    .filter(Boolean)
    .slice()
    .sort((a, b) => {
      const timeDiff = (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
      if (timeDiff) return timeDiff;
      return (Number(b.positionSeconds) || 0) - (Number(a.positionSeconds) || 0);
    });
}

export const watchProgressService = {
  getEpisodeProgress(progress, contentId, episodeId) {
    if (!contentId || !episodeId || !Array.isArray(progress)) return null;
    return progress.find(item => item?.contentId === contentId && item?.episodeId === episodeId) ?? null;
  },

  getContentProgress(progress, contentId) {
    if (!contentId || !Array.isArray(progress)) return [];
    return sortProgress(progress.filter(item => item?.contentId === contentId));
  },

  getContentResume(progress, contentId, episodes = []) {
    const items = this.getContentProgress(progress, contentId);
    if (!items.length) {
      return {
        progress: null,
        episodeIndex: 0,
        positionSeconds: 0,
        durationSeconds: null,
        completed: false,
        hasProgress: false,
      };
    }

    const episodeIndexFor = item => {
      const index = episodes.findIndex(episode => episode?.episodeId === item?.episodeId);
      return index >= 0 ? index : 0;
    };

    const latest = items[0];
    const unfinished = items.find(item => !item.completed && Number(item.positionSeconds) > 5) ?? null;
    const target = unfinished ?? latest;
    let episodeIndex = episodeIndexFor(target);

    // 完成当前集后，继续播放按钮应该自然指向下一集，而不是再次打开已完成集。
    if (target.completed && episodes.length > 0 && episodeIndex < episodes.length - 1) {
      episodeIndex += 1;
    }

    const positionSeconds = target.completed && target === latest && episodeIndex !== episodeIndexFor(target)
      ? 0
      : Math.max(0, Number(target.positionSeconds) || 0);

    return {
      progress: target,
      latestProgress: latest,
      episodeIndex,
      positionSeconds,
      durationSeconds: target.durationSeconds ?? null,
      completed: Boolean(target.completed),
      hasProgress: Number(target.positionSeconds) > 5 || Boolean(target.completed),
    };
  },

  getContinueWatching(progress, contents = []) {
    if (!Array.isArray(progress) || !Array.isArray(contents)) return [];
    const contentMap = new Map(contents.filter(item => item?.contentId).map(item => [item.contentId, item]));
    const byContent = new Map();

    progress.forEach(item => {
      if (!item?.contentId || !contentMap.has(item.contentId)) return;
      const previous = byContent.get(item.contentId);
      if (!previous || (Number(item.updatedAt) || 0) > (Number(previous.updatedAt) || 0)) {
        byContent.set(item.contentId, item);
      }
    });

    return [...byContent.entries()]
      .map(([contentId, item]) => {
        const content = contentMap.get(contentId);
        const resume = this.getContentResume(progress, contentId, content?.episodes ?? []);
        return { content, progress: item, ...resume };
      })
      .filter(item => item.progress && !item.progress.completed && Number(item.progress.positionSeconds) > 5)
      .sort((a, b) => (Number(b.progress.updatedAt) || 0) - (Number(a.progress.updatedAt) || 0));
  },
};
