const context = {};
const distance = (fx, fy, sx, sy) => { // compute distance between pixels
  return Math.sqrt(Math.pow(sy - fy, 2) + Math.pow(sx - fx, 2));
}
const withinRadius = (px, py, shorePixel) => { // compute if shorePixel is within the radius of any of the toDo pixels
  if (distance(px, py, shorePixel[0], shorePixel[1]) <= context.radius) {
    return true;
  }
  for (let pixel of context.shore) {
    if (pixel[0] == shorePixel[0] && pixel[1] == shorePixel[1]) {
      continue;
    }
    if (distance(px, py, pixel[0], pixel[1]) <= context.radius) {
      return true;
    }
  }
  return false;
}
const getPixel = (x, y) => {
  const start = (y * context.width + x) * 4;
  return context.pixels.slice(start, start + 4);
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
  if (!context.done[label] && withinImage && isBlank(px, py)) {
    if (withinRadius(px, py, shorePixel)) {
      context.done[label] = true;
      context.filled.push([px, py]);
      context.toDoNext.push([px, py]);
    }
    else {
      context.edge[label] = [px, py];
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
  for (let pixel of context.toDo) {
    parseNeighbors(pixel[0], pixel[1], shorePixel);
  }
  context.toDo = context.toDoNext; // new shore line
  context.toDoNext = [];
}
const parseShore = () => {
  context.shore = context.nextShore;
  context.nextShore = [];
  for (let item of context.shore) {
    context.toDo = [item];
    while (context.toDo.length) {
      doShorePixel(item);
    }
  }
  context.nextShore = Object.values(context.edge);
}
const init = (input) => {
  for (let key in input) {
    context[key] = input[key];
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
      context.edge = {};
      context.filled = [];
      init(message.data.input);
      parseShore();
      postMessage({
        status: 'done',
        output: {
          index: context.index,
          nextShore: context.nextShore,
          filled: context.filled // pixels to be filled in main thread
        }
      });
    break;
  }
}
