// Human-readable formatting shared by the status row, splash progress lines,
// and log messages. Pure functions, free of DOM access.

/** Byte count with a binary unit: "512 B", "1.5 KB", "12.3 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Duration in milliseconds as "12.3 s" below a minute, otherwise
 * "2 min 05 s". Negative or non-finite input reads as zero.
 */
export function formatElapsed(ms: number): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0
  const seconds = safeMs / 1000
  if (seconds < 60) {
    return `${seconds.toFixed(1)} s`
  }
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds - minutes * 60)
  return `${minutes} min ${String(rest).padStart(2, '0')} s`
}
