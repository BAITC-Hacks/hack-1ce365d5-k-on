export interface Point { x: number; y: number }

// Inverse projective mapping from four actual DOM probes to the map plane.
// Handles CSS perspective, tilt, rotation, zoom and the iframe viewport scale.
export function screenToPlane(point: Point, corners: Point[]): Point | null {
  if (corners.length !== 4) return null
  const plane = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]
  const matrix: number[][] = []
  corners.forEach(({ x, y }, i) => {
    const { x: u, y: v } = plane[i]
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u])
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y, v])
  })
  for (let col = 0; col < 8; col++) {
    let pivot = col
    for (let row = col + 1; row < 8; row++) if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row
    if (Math.abs(matrix[pivot][col]) < 1e-10) return null
    ;[matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]]
    const divisor = matrix[col][col]
    for (let j = col; j <= 8; j++) matrix[col][j] /= divisor
    for (let row = 0; row < 8; row++) {
      if (row === col) continue
      const factor = matrix[row][col]
      for (let j = col; j <= 8; j++) matrix[row][j] -= factor * matrix[col][j]
    }
  }
  const h = matrix.map((row) => row[8])
  const divisor = h[6] * point.x + h[7] * point.y + 1
  if (Math.abs(divisor) < 1e-10) return null
  return { x: (h[0] * point.x + h[1] * point.y + h[2]) / divisor, y: (h[3] * point.x + h[4] * point.y + h[5]) / divisor }
}
