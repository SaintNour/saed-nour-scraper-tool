/**
 * Platform-agnostic enrichment for analyzer/API content rows.
 * YouTube remains the live source; these fields normalize into a shared shape for UI and future networks.
 */

/**
 * @param {string | undefined} format
 * @returns {'video' | 'short' | 'post' | 'thread' | 'reel' | 'unknown'}
 */
function mapContentFormatToContentType(format) {
  const f = String(format ?? 'unknown').toLowerCase();
  if (f === 'video' || f === 'short' || f === 'post' || f === 'thread' || f === 'reel') return f;
  return 'unknown';
}

/**
 * Attach unified fields to one analyzer row (mutates nothing; returns a new object).
 * @param {string} platform
 * @param {Record<string, unknown>} row
 * @returns {Record<string, unknown>}
 */
function enrichAnalyzerContentRow(platform, row) {
  const id = String(row.id ?? '');
  const contentFormat = row.content_format || row.contentFormat || 'unknown';
  const contentType = mapContentFormatToContentType(
    typeof contentFormat === 'string' ? contentFormat : 'unknown',
  );
  const url = typeof row.url === 'string' ? row.url.trim() : '';
  const canonicalUrl = url || null;
  const comments = Number(row.comments_analyzed ?? row.commentsAnalyzed ?? 0) || 0;
  const existingMetrics =
    row.metrics && typeof row.metrics === 'object' ? { .../** @type {object} */ (row.metrics) } : {};

  const metrics = {
    view_count:
      existingMetrics.view_count != null
        ? Number(existingMetrics.view_count)
        : row.view_count != null
          ? Number(row.view_count)
          : null,
    like_count:
      existingMetrics.like_count != null
        ? Number(existingMetrics.like_count)
        : row.like_count != null
          ? Number(row.like_count)
          : null,
    comment_count: comments,
    share_count:
      existingMetrics.share_count != null ? Number(existingMetrics.share_count) : null,
    creator_follower_count:
      existingMetrics.creator_follower_count != null
        ? Number(existingMetrics.creator_follower_count)
        : row.subscriber_count != null
          ? Number(row.subscriber_count)
          : null,
  };

  return {
    ...row,
    platform,
    content_id: id,
    content_type: contentType,
    canonical_url: canonicalUrl,
    description_text:
      typeof row.description === 'string'
        ? row.description
        : typeof row.description_text === 'string'
          ? row.description_text
          : '',
    creator_name:
      typeof row.creator_name === 'string'
        ? row.creator_name
        : typeof row.channel_title === 'string'
          ? row.channel_title
          : null,
    published_at:
      typeof row.published_at === 'string'
        ? row.published_at
        : typeof row.publishedAt === 'string'
          ? row.publishedAt
          : null,
    metrics,
  };
}

/**
 * Ensure `content_items` / `total_content_items` mirror legacy `videos` / `total_videos`.
 * @param {Record<string, unknown>} payload
 * @returns {Record<string, unknown>}
 */
function attachContentItemsMirror(payload) {
  const list = Array.isArray(payload.content_items)
    ? payload.content_items
    : Array.isArray(payload.videos)
      ? payload.videos
      : [];
  const total =
    typeof payload.total_content_items === 'number'
      ? payload.total_content_items
      : typeof payload.total_videos === 'number'
        ? payload.total_videos
        : list.length;

  return {
    ...payload,
    total_content_items: total,
    total_videos: total,
    content_items: list,
    videos: list,
  };
}

module.exports = {
  mapContentFormatToContentType,
  enrichAnalyzerContentRow,
  attachContentItemsMirror,
};
