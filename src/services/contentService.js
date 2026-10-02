export const contentService = {
  getMovies: (items) => items,
  getById: (items, contentId) => items.find((item) => item.contentId === contentId) ?? null,
};
