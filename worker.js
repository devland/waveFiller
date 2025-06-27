this.distance = (fx, fy, sx, sy) => { // compute distance between pixels
  return Math.sqrt(Math.pow(sy - fy, 2) + Math.pow(sx - fx, 2));
}
this.withinRadius = (px, py, shorePixel) => { // compute if shorePixel is within the radius of any of the toDo pixels
  if (this.distance(px, py, shorePixel[0], shorePixel[1]) <= this.radius) {
    return true;
  }
  for (let pixel of this.shore) {
    if (pixel[0] == shorePixel[0] && pixel[1] == shorePixel[1]) {
      continue;
    }
    if (this.distance(px, py, pixel[0], pixel[1]) <= this.radius) {
      return true;
    }
  }
  return false;
}
this.parseNeighbors = (x, y, shorePixel) => {
  const doNeighbor = (px, py, withinImage) => {
    const label = `${px}|${py}`;
    if (!this.done[label] && withinImage && this.isBlank(px, py)) {
      if (this.withinRadius(px, py, shorePixel)) {
        this.done[label] = true;
        this.putPixel(px, py);
        this.toDoNext.push([px, py]);
      }
      else {
        this.edge[label] = [px, py];
      }
    }
  }
  let px = x;
  let py = y - 1;
  doNeighbor(px, py, py >= 0);
  px = x + 1;
  py = y;
  doNeighbor(px, py, px <= this.image.width);
  px = x;
  py = y + 1;
  doNeighbor(px, py, py <= this.image.height);
  px = x - 1;
  py = y;
  doNeighbor(px, py, px >= 0);
}
this.doShorePixel = (shorePixel) => {
  for (let pixel of this.toDo) {
    this.parseNeighbors(pixel[0], pixel[1], shorePixel);
  }
  this.toDo = this.toDoNext; // new shore line
  this.lastToDo = this.toDoNext;
  this.toDoNext = [];
}
this.parseShore = () => {
  this.shore = this.nextShore;
  this.nextShore = [];
  for (let item of this.shore) {
    this.toDo = [item];
    while (this.toDo.length) {
      this.doShorePixel(item);
    }
  }
  this.nextShore = Object.values(this.edge);
}
onmessage = (message) => {
  switch (message.data.type) {
    case 'init':
      for (let key in message.data.input) {
        this[key] = message.data.input[key];
      }
      postMessage({status: 'initDone'});
    break;
    default:
      postMessage({
        status: 'done',
        filled: [] // pixels to be filled in main thread
      });
    break;
  }
}
