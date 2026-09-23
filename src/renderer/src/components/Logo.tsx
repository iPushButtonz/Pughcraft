/** The Pughcraft block. Same artwork as the app icon, without the tile. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="112 120 288 320" className={className} aria-hidden="true">
      <polygon points="256,120 400,200 256,280 112,200" fill="#6cc24a" />
      <polygon points="112,200 256,280 256,440 112,360" fill="#8b5a2b" />
      <polygon points="256,280 400,200 400,360 256,440" fill="#6e4520" />
      <polygon points="112,200 256,280 256,318 112,238" fill="#4f9a37" />
      <polygon points="256,280 400,200 400,238 256,318" fill="#3f7f2c" />
      <polygon points="256,120 400,200 368,218 256,156 144,218 112,200" fill="#86d764" />
    </svg>
  )
}
