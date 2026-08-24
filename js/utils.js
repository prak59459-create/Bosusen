export function rand(min, max) {
  return Math.random() * (max - min) + min;
}

export function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

export function noise2D(seed) {
  return (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
    return s - Math.floor(s);
  };
}
