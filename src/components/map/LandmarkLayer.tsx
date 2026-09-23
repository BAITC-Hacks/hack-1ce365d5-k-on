import { memo } from 'react'
import { landmarks } from '../../data/landmarks'

export const LandmarkLayer = memo(function LandmarkLayer() {
  return <div className="landmark-layer map-layer">
    {landmarks.map((landmark) => <div className="landmark-anchor map-anchor" key={landmark.id} style={{ left: `${landmark.x}%`, top: `${landmark.y}%` }}>
      <figure className="landmark billboard" style={{ width: landmark.width * landmark.scale }}>
        <svg viewBox={landmark.viewBox} width={landmark.width * landmark.scale} height={landmark.height * landmark.scale} role="img" aria-label={landmark.name}>
          <defs><clipPath id={`cutout-${landmark.id}`}><polygon points={landmark.outline} /></clipPath></defs>
          <image href={landmark.image} width="1536" height="1024" clipPath={`url(#cutout-${landmark.id})`} />
        </svg><figcaption>{landmark.name}</figcaption>
      </figure>
    </div>)}
  </div>
})
