function filler(options) {
  this.threshold = 20;
  this.radius = 50;
  this.blank = [255, 255, 255, 255]; // white
  this.pixel = [255, 0, 0, 50]; //red
  this.fps = 60; // frame limiter
  this.initialize = () => {
    this.canvas = document.getElementById(options.canvasId);
    this.context = this.canvas.getContext('2d');
    this.paint(1920, null, true);
    this.canvas.addEventListener('click', ((event) => {
      this.click(event.clientX, event.clientY);
    }));
  }
  this.paint = (width, height, resize) => { // paint image in canvas
    this.image = new Image();
    this.image.src = options.imageSrc;
    this.image.onload = () => {
      let resized;
      if (width) {
        height = this.image.height / this.image.width * width;
      }
      else if (height) {
        width = this.image.width / this.image.height * height;
      }
      else {
        resized = this.fit();
        width = resized.width;
        height = resized.height;
      }
      this.canvas.width = width;
      this.canvas.height = height;
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.context.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
      this.pixels = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
      if (resize) {
        resized = this.fit();
        this.canvas.style.width = resized.width;
        this.canvas.style.height = resized.height;
      }
      if (this.canvas.offsetWidth < window.innerWidth)
        this.canvas.style.left = (window.innerWidth - this.canvas.offsetWidth) / 2 + 'px';
      if (this.canvas.offsetHeight < window.innerHeight)
        this.canvas.style.top = (window.innerHeight - this.canvas.offsetHeight) / 2 + 'px';
      this.canvasScale = this.canvas.width / this.canvas.offsetWidth;
    }
  }
  this.fit = () => { // resize image to fit canvas
    let width;
    let height;
    if (this.image.width >= this.image.height) {
      width = this.image.width > window.innerWidth ? window.innerWidth : this.image.width;
      height = parseInt(this.image.height / this.image.width * width);
      if (height > window.innerHeight) {
        height = window.innerHeight;
        width = parseInt(this.image.width / this.image.height * height);
      }
    }
    else {
      height = this.image.height > window.innerHeight ? window.innerHeight : this.image.height;
      width = parseInt(this.image.width / this.image.height * height);
      if (width > window.innerWidth) {
        width = window.innerWidth;
        height = parseInt(this.image.height / this.image.width * width);
      }
    }
    return { width, height };
  }
  this.cursor = {};
  this.getPixel = (x, y) => {
    const start = (y * this.image.width + x) * 4;
    return this.pixels.data.slice(start, start + 4);
  }
  this.putPixel = (x, y) => {
    const start = (y * this.image.width + x) * 4;
    this.pixels.data[start] = this.pixel[0];
    this.pixels.data[start + 1] = this.pixel[1];
    this.pixels.data[start + 2] = this.pixel[2];
    this.pixels.data[start + 3] = this.pixel[3];
  }
  this.isBlank = (x, y) => {
    const pixel = this.getPixel(x, y);
    if (Math.abs(this.blank[0] - pixel[0]) <= this.threshold &&
        Math.abs(this.blank[1] - pixel[1]) <= this.threshold &&
        Math.abs(this.blank[2] - pixel[2]) <= this.threshold &&
        Math.abs(this.blank[3] - pixel[3]) <= this.threshold) {
      return true;
    }
    return false;
  }
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
  this.paintFrame = () => {
    this.context.putImageData(this.pixels, 0, 0);
  }
  const frameTime = 1000 / this.fps;
  this.skipFrame = false;
  this.compute = () => {
    if (this.skipFrame) {
      if (window.performance.now() - this.frameStart >= frameTime) {
        this.skipFrame = false;
      }
      window.requestAnimationFrame(this.compute);
      return;
    }
    this.frameStart = window.performance.now();
    this.edge = {};
    this.parseShore();
    this.paintFrame();
    this.renderTime = window.performance.now() - this.frameStart;
    if (this.renderTime < frameTime) {
      this.skipFrame = true;
    }
    if (!this.nextShore.length) {
      this.end = window.performance.now();
      console.log(`done in ${this.end - this.start} ms`);
      this.locked = false;
    }
    else {
      window.requestAnimationFrame(this.compute);
    }
  }
  this.renderTime = 1000;
  this.click = (x, y) => {
    if (this.locked) {
      console.log('> nope; locked.');
      return;
    }
    this.locked = true;
    this.done = {};
    x = Math.floor((x - this.canvas.offsetLeft) * this.canvasScale);
    y = Math.floor((y - this.canvas.offsetTop) * this.canvasScale);
    this.shore = [];
    this.nextShore = [[x, y]];
    this.toDoNext = [];
    this.toDo = this.nextShore;
    this.start = window.performance.now();
    this.compute();
  }
}
