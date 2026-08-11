/**
 * A same-version state push is usually a theme, visibility, or panel refresh.
 * It must not replace text that the Webview has already sent but not yet acknowledged.
 */
export function shouldPreserveLocalEdit(current, next, editInFlight, pendingMarkdown) {
  return Boolean(
    current &&
    next &&
    current.documentUri === next.documentUri &&
    current.documentVersion === next.documentVersion &&
    (editInFlight || typeof pendingMarkdown === 'string'),
  );
}
