"use strict";
function waveFiller(options) {
  this.canvas = options.canvas; // canvas DOM element
  this.imageSrc = options.imageSrc; // image to render in the canvas
  this.threshold = options.threshold || 20; // maximum deviance in color channel value allowed for a pixel to be considered blank
  this.blank = options.blank || [255, 255, 255, 255]; // white - set it to whatever color is considered blank in the image
  this.pixel = options.pixel || [255, 0, 0, 50]; // red - set it to whatever fill color you want as RGBA
  this.radius = options.radius || 20; // wave size in pixels rendered per frame
  this.fps = options.fps ?? 60; // frame limiter (set to 0 to disable); actual fps can be lower depending on your CPU
  this.dimensions = options.dimensions;
  this.workerCount = options.workerCount || Math.floor(window.navigator.hardwareConcurrency / 2); // number of web workers to be used
  this.minWorkerLoad = options.minWorkerLoad || 100; // minimum number of shore pixels, if more are available, to be assigned to a web worker
  this.maxWorkerLoad = options.maxWorkerLoad ?? 200; // maximum number of shore pixels to be assigned to a worker (set to 0 to disable)
  this.computeAhead = options.computeAhead; // set to true to compute upcoming frames before current frame is done for faster overall rendering; warning: wave is no longer an advancing circle when filling large areas
  this.libraryPath = options.libraryPath || './' // path to library directory relative to current context
  this.silent = options.silent // set to true to disable console logs
  const frameTime = this.fps ? 1000 / this.fps : 0;
  let skipTimeDiff = 0;
  let frameStart = 0;
  let assigningWork = false;
  const workerPromise = {
    resolve: () => {},
    reject: () => {},
    count: 0
  }
  this.initialize = () => {
    return new Promise ((resolve, reject) => {
      this.context = this.canvas.getContext('2d');
      let width = this.dimensions.width;
      let height = this.dimensions.height;
      this.image = new Image();
      this.image.src = this.imageSrc;
      this.image.onload = async () => {
        try {
          if (width) {
            height = this.image.height / this.image.width * width;
          }
          else if (height) {
            width = this.image.width / this.image.height * height;
          }
          this.canvas.width = width;
          this.canvas.height = height;
          this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
          this.context.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
          this.pixels = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
          this.workers = [];
          workerPromise.resolve = resolve;
          workerPromise.reject = reject;
          const workerBlob = await (await fetch(`${this.libraryPath}worker.js`)).blob();
          for (let index = 0; index < this.workerCount; index++) {
            const worker = new Worker(URL.createObjectURL(workerBlob));
            worker.working = false;
            worker.onmessage = (message) => {
              switch (message.data.status) {
                case 'initDone':
                  workerPromise.count++;
                  if (workerPromise.count == this.workerCount) {
                    log(`web worker init done; ${workerPromise.count} web workers ready`);
                    workerPromise.resolve(workerPromise.count);
                    workerPromise.count = 0;
                  }
                break;
                case 'done':
                  handleWorkerDone(message.data.output);
                break;
              }
            }
            worker.onerror = (error) => {
              log([`worker ${index} error`, error]);
              workerPromise.reject(error);
            }
            worker.onmessageerror = (error) => {
              log([`worker ${index} message error`, error]);
              workerPromise.reject(error);
            }
            worker.postMessage({
              type: 'init',
              input: {
                index,
                threshold: this.threshold,
                blank: this.blank,
                pixel: this.pixel,
                radius: this.radius,
                width: this.canvas.width,
                height: this.canvas.height,
                pixels: this.pixels.data
              }
            });
            this.workers.push(worker);
          }
        }
        catch (error) {
          log(['initialize error', error]);
          reject(error);
        }
      }
    });
  }
  this.fit = (maxWidth, maxHeight, center) => { // compute canvas size and position to fit within given max dimensions
    let width;
    let height;
    let left;
    let top;
    if (this.image.width >= this.image.height) {
      width = parseInt(this.image.width > maxWidth ? maxWidth : this.image.width);
      height = parseInt(this.image.height / this.image.width * width);
      if (height > maxHeight) {
        height = parseInt(maxHeight);
        width = parseInt(this.image.width / this.image.height * height);
      }
    }
    else {
      height = parseInt(this.image.height > maxHeight ? maxHeight : this.image.height);
      width = parseInt(this.image.width / this.image.height * height);
      if (width > maxWidth) {
        width = parseInt(maxWidth);
        height = parseInt(this.image.height / this.image.width * width);
      }
    }
    if (center) {
      left = parseInt((maxWidth - width) / 2);
      top = parseInt((maxHeight - height) / 2);
    }
    return { width, height, left, top };
  }
  this.resize = (maxWidth, maxHeight, center) => {
    const resized = this.fit(maxWidth, maxHeight, center);
    this.canvas.style.width = resized.width + 'px';
    this.canvas.style.height = resized.height + 'px';
    if (center) {
      this.canvas.style.left = resized.left + 'px';
      this.canvas.style.top = resized.top + 'px';
    }
  }
  this.updateWorkers = () => {
    return new Promise((resolve, reject) => {
      workerPromise.resolve = resolve;
      workerPromise.reject = reject;
      for (let i = 0; i < this.workerCount; i++) {
        this.workers[i].postMessage({
          type: 'init',
          input: {
            threshold: this.threshold,
            blank: this.blank,
            pixel: this.pixel,
            radius: this.radius,
            width: this.canvas.width,
            height: this.canvas.height,
            pixels: this.pixels.data
          }
        });
      }
    });
  }
  this.putPixel = (x, y) => {
    const start = (y * this.canvas.width + x) * 4;
    this.pixels.data[start] = this.pixel[0];
    this.pixels.data[start + 1] = this.pixel[1];
    this.pixels.data[start + 2] = this.pixel[2];
    this.pixels.data[start + 3] = this.pixel[3];
  }
  const checkFrame = (frame) => {
    if (!this.frames[frame]) {
      this.frames[frame] = {
        shore: [],
        worked: 0,
        nextIdleShorePixel: 0,
        filled: []
      }
    }
  }
  const getIdleWorkers = () => {
    const idle = [];
    for (let i = 0; i < this.workerCount; i++) {
      if (!this.workers[i].working) {
        idle.push(i);
      }
    }
    return idle;
  }
  const getIdleFrameIndex = (frame) => {
    while (this.frames[frame]) {
      if (this.frames[frame].nextIdleShorePixel < this.frames[frame].shore.length) {
        return frame;
      }
      frame++;
    }
    return -1;
  }
  const assignWork = () => {
    if (assigningWork) {
      return;
    }
    const idleFrameIndex = getIdleFrameIndex(this.frame);
    const idleWorkers = getIdleWorkers();
    if (idleFrameIndex < 0 || !idleWorkers.length) {
      return;
    }
    assigningWork = true;
    let assigned = 0;
    const idleFrame = this.frames[idleFrameIndex];
    let slice = Math.max(Math.ceil((idleFrame.shore.length - idleFrame.nextIdleShorePixel) / idleWorkers.length), this.minWorkerLoad);
    if (this.maxWorkerLoad && slice > this.maxWorkerLoad) {
      slice = this.maxWorkerLoad;
    }
    for (let i = 0; i < idleWorkers.length; i++) {
      const workerIndex = idleWorkers[i];
      const start = idleFrame.nextIdleShorePixel + slice * i;
      if (start > idleFrame.shore.length) {
        break;
      }
      const end = start + slice;
      const shore = idleFrame.shore.slice(start, end);
      if (!shore.length) {
        continue;
      }
      this.workers[workerIndex].working = true;
      this.workers[workerIndex].frame = idleFrameIndex;
      this.workers[workerIndex].postMessage({
        type: 'work',
        input: {
          frame: idleFrameIndex,
          shore
        }
      });
      assigned += shore.length;
    }
    idleFrame.nextIdleShorePixel += assigned;
    assigningWork = false;
  }
  const handleWorkerDone = (output) => {
    this.workers[output.index].working = false;
    checkFrame(output.frame + 1);
    const currentFrame = this.frames[this.frame];
    const outputFrame = this.frames[output.frame];
    const nextFrame = this.frames[output.frame + 1];
    outputFrame.worked += output.worked;
    nextFrame.shore = nextFrame.shore.concat(output.nextShore);
    outputFrame.filled = outputFrame.filled.concat(output.filled);
    checkFrameReady();
    if (this.computeAhead) {
      assignWork();
    }
    else if (this.maxWorkerLoad && output.frame == this.frame && currentFrame.nextIdleShorePixel < currentFrame.shore.length) {
      assignWork(this.frame);
    }
  }
  const checkFrameReady = () => {
    const currentFrame = this.frames[this.frame];
    if (!currentFrame) {
      return;
    }
    if (currentFrame.worked == currentFrame.shore.length && (this.frame == 0 || this.frames[this.frame - 1].computed)) { // frame done
      const computeTime = window.performance.now() - frameStart;
      if (computeTime < frameTime - skipTimeDiff) {
        window.requestAnimationFrame(checkFrameReady);
      }
      else {
        paintFrame();
      }
    }
    else {
      window.requestAnimationFrame(checkFrameReady);
    }
  }
  const paintFrame = () => {
    let currentFrame = this.frames[this.frame];
    if (!currentFrame.shore.length) {
      return;
    }
    for (let i = 0; i < currentFrame.filled.length; i++) {
      this.putPixel(currentFrame.filled[i][0], currentFrame.filled[i][1]);
    }
    this.context.putImageData(this.pixels, 0, 0);
    delete currentFrame.shore;
    delete currentFrame.filled;
    currentFrame.computed = true;
    this.frame++;
    currentFrame = this.frames[this.frame];
    if (!currentFrame?.shore.length) { // animation done
      this.end = window.performance.now();
      this.runTime = this.end - this.start;
      log(`done in ${this.runTime} ms @ ${((Object.keys(this.frames).length - 1) / this.runTime * 1000).toFixed(2)} fps`);
      this.locked = false;
      workerPromise.resolve();
    }
    else {
      const computeTime = window.performance.now() - frameStart;
      skipTimeDiff = this.fps ? computeTime - frameTime + skipTimeDiff : 0;
      computeNextFrame();
    }
  }
  const computeNextFrame = () => {
    frameStart = window.performance.now();
    if (!this.computeAhead) {
      assignWork();
    }
  }
  this.fill = (x, y) => {
    return new Promise ((resolve, reject) => {
      if (this.locked) {
        log('locked; already running');
        resolve();
        return;
      }
      workerPromise.resolve = resolve;
      workerPromise.reject = reject;
      this.locked = true;
      this.frame = 0;
      this.frames = {};
      skipTimeDiff = 0;
      checkFrame(this.frame);
      this.frames[this.frame].shore = [[x, y]];
      this.start = window.performance.now();
      computeNextFrame();
      assignWork();
    });
  }
  this.click = (x, y) => { // computes x, y click event coordinates relative to canvas pixels
    const canvasScale = this.canvas.width / this.canvas.offsetWidth;
    const canvasBR = this.canvas.getBoundingClientRect();
    x = Math.floor((x - canvasBR.left) * canvasScale);
    y = Math.floor((y - canvasBR.top) * canvasScale);
    return this.fill(x, y);
  }
  const log = (input) => {
    if (this.silent) {
      return;
    }
    const isArray = Array.isArray(input);
    console.log(`waveFiller: ${!isArray ? input : ''}`);
    if (isArray) {
      for (let i = 0; i < input.length; i++) {
        console.log(input[i]);
      }
    }
  }
}
