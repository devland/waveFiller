const context = {};
const distance = (fx, fy, sx, sy) => { // compute distance between pixels
  return Math.sqrt(Math.pow(sy - fy, 2) + Math.pow(sx - fx, 2));
}
const withinRadius = (px, py, shorePixel) => { // compute if shorePixel is within the radius of any of the toDo pixels
  if (distance(px, py, shorePixel[0], shorePixel[1]) <= context.radius) {
    return true;
  }
  for (let i = 0; i < context.shore.length; i++) {
    if (context.shore[i][0] == shorePixel[0] && context.shore[i][1] == shorePixel[1]) {
      continue;
    }
    if (distance(px, py, context.shore[i][0], context.shore[i][1]) <= context.radius) {
      return true;
    }
  }
  return false;
}
const getPixel = (x, y) => {
  const start = (y * context.width + x) * 4;
  return context.pixels.slice(start, start + 4);
}
const putPixel = (x, y) => {
  const start = (y * context.width + x) * 4;
  context.pixels[start] = context.pixel[0];
  context.pixels[start + 1] = context.pixel[1];
  context.pixels[start + 2] = context.pixel[2];
  context.pixels[start + 3] = context.pixel[3];
}
const isBlank = (x, y) => {
  const pixel = getPixel(x, y);
  if (Math.abs(context.blank[0] - pixel[0]) <= context.threshold &&
      Math.abs(context.blank[1] - pixel[1]) <= context.threshold &&
      Math.abs(context.blank[2] - pixel[2]) <= context.threshold &&
      Math.abs(context.blank[3] - pixel[3]) <= context.threshold) {
    return true;
  }
  return false;
}
const doNeighbor = (px, py, withinImage, shorePixel) => {
  const label = `${px}|${py}`;
  if (withinImage && isBlank(px, py)) {
    if (withinRadius(px, py, shorePixel)) {
      putPixel(px, py);
      context.filled.push([px, py]);
      context.toDoNext.push([px, py]);
    }
    else {
      context.edge.push([px, py]);
    }
  }
}
const parseNeighbors = (x, y, shorePixel) => {
  let px = x;
  let py = y - 1;
  doNeighbor(px, py, py >= 0, shorePixel);
  px = x + 1;
  py = y;
  doNeighbor(px, py, px <= context.width, shorePixel);
  px = x;
  py = y + 1;
  doNeighbor(px, py, py <= context.height, shorePixel);
  px = x - 1;
  py = y;
  doNeighbor(px, py, px >= 0, shorePixel);
}
const doShorePixel = (shorePixel) => {
  for (let i = 0; i < context.toDo.length; i++) {
    parseNeighbors(context.toDo[i][0], context.toDo[i][1], shorePixel);
  }
  context.toDo = context.toDoNext; // new shore line
  context.toDoNext = [];
}
const parseShore = () => {
  for (let i = 0; i < context.shore.length; i++) {
    context.toDo = [context.shore[i]];
    while (context.toDo.length) {
      doShorePixel(context.shore[i]);
    }
  }
}
const init = (input) => {
  const keys = Object.keys(input);
  for (let i = 0; i < keys.length; i++) {
    context[keys[i]] = input[keys[i]];
  }
}
onmessage = (message) => {
  switch (message.data.type) {
    case 'init':
      init(message.data.input);
      postMessage({status: 'initDone'});
    break;
    case 'work':
      context.toDoNext = [];
      context.edge = [];
      context.filled = [];
      init(message.data.input);
      parseShore();
      postMessage({
        status: 'done',
        output: {
          workerIndex: context.workerIndex, // worker index
          frameIndex: context.frameIndex,
          worked: context.shore.length,
          filled: context.filled, // pixels to be filled in main thread
          nextShore: context.edge
        }
      });
    break;
  }
}
