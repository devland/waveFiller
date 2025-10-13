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
  this.record = options.record; // set this to true to enable undo, redo & playback functionality
  this.libraryPath = options.libraryPath || './' // path to library directory relative to current context
  this.silent = options.silent // set to true to disable console logs
  let idealFrameTime;
  let skipTimeDiff = 0;
  let frameStart;
  let cleanStart;
  let assigningWork = false;
  const work = {
    resolve: () => {},
    reject: () => {}
  }
  this.initialize = () => {
    return new Promise ((resolve, reject) => {
      this.history = [];
      this.historyIndex = -1;
      this.frameIndex = 0;
      this.player = {};
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
          // init workers
          this.workers = [];
          work.resolve = resolve;
          work.reject = reject;
          work.count = 0;
          for (let index = 0; index < this.workerCount; index++) {
            const worker = new Worker(`${this.libraryPath}/worker.js`);
            worker.working = false;
            worker.onmessage = (message) => {
              switch (message.data.status) {
                case 'initDone':
                  work.count++;
                  if (work.count == this.workerCount) {
                    log(`web worker init done; ${work.count} web workers ready`);
                    work.resolve(work.count);
                    delete work.count;
                  }
                break;
                case 'done':
                  handleWorkerDone(message.data.output);
                break;
              }
            }
            worker.onerror = (error) => {
              log([`worker ${index} error`, error]);
              work.reject(error);
            }
            worker.onmessageerror = (error) => {
              log([`worker ${index} message error`, error]);
              work.reject(error);
            }
            worker.postMessage({
              type: 'init',
              input: {
                workerIndex: index,
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
          // init cleaner
          this.cleaner = new Worker(`${this.libraryPath}/cleaner.js`);
          this.cleaner.onmessage = (message) => {
            this.frames = message.data.frames;
            this.totalFilled = message.data.totalFilled;
            if (this.frames.length) {
              this.history.splice(this.historyIndex, Infinity, {
                frames: this.frames,
                totalFilled: message.data.totalFilled,
                pixel: this.pixel,
                blank: this.blank
              });
            }
            else {
              this.historyIndex--;
            }
            this.locked = false;
            log(`cleaning done in ${window.performance.now() - cleanStart} ms`);
            log(`${this.totalFilled} pixels filled`);
            work.resolve();
          }
          this.cleaner.onerror = (error) => {
            log([`cleaner error`, error]);
          }
          this.cleaner.onmessageerror = (error) => {
            log([`cleaner message error`, error]);
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
      work.resolve = resolve;
      work.reject = reject;
      work.count = 0;
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
  this.putPixel = (x, y, pixel) => {
    const start = (y * this.canvas.width + x) * 4;
    this.pixels.data[start] = pixel[0];
    this.pixels.data[start + 1] = pixel[1];
    this.pixels.data[start + 2] = pixel[2];
    this.pixels.data[start + 3] = pixel[3];
  }
  const checkFrame = (index) => {
    if (!this.frames[index]) {
      this.frames[index] = {
        shore: [],
        worked: 0,
        nextIdleShorePixel: 0,
        filled: [],
        blank: this.blank
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
  const getIdleFrameIndex = (index) => {
    while (this.frames[index]) {
      if (this.frames[index].nextIdleShorePixel < this.frames[index].shore.length) {
        return index;
      }
      index++;
    }
    return -1;
  }
  const assignWork = () => {
    if (assigningWork) {
      return;
    }
    const idleFrameIndex = getIdleFrameIndex(this.frameIndex);
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
          frameIndex: idleFrameIndex,
          shore
        }
      });
      assigned += shore.length;
    }
    idleFrame.nextIdleShorePixel += assigned;
    assigningWork = false;
  }
  const handleWorkerDone = (output) => {
    this.workers[output.workerIndex].working = false;
    checkFrame(output.frameIndex + 1);
    const currentFrame = this.frames[this.frameIndex];
    const outputFrame = this.frames[output.frameIndex];
    const nextFrame = this.frames[output.frameIndex + 1];
    outputFrame.worked += output.worked;
    nextFrame.shore = nextFrame.shore.concat(output.nextShore);
    outputFrame.filled = outputFrame.filled.concat(output.filled);
    if (this.computeAhead) {
      assignWork();
    }
    else if (this.maxWorkerLoad && output.frame == this.frameIndex && currentFrame.nextIdleShorePixel < currentFrame.shore.length) {
      assignWork(this.frameIndex);
    }
  }
  const checkFrameReady = () => {
    const currentFrame = this.frames[this.frameIndex];
    if (!currentFrame) {
      return;
    }
    if (currentFrame.worked == currentFrame.shore.length && (this.frameIndex == 0 || this.frames[this.frameIndex - 1].computed)) { // frame done
      const frameTime = window.performance.now() - frameStart;
      if (frameTime < idealFrameTime - skipTimeDiff) {
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
    let currentFrame = this.frames[this.frameIndex];
    if (!currentFrame.shore.length) {
      return;
    }
    for (let i = 0; i < currentFrame.filled.length; i++) {
      this.putPixel(currentFrame.filled[i][0], currentFrame.filled[i][1], this.pixel);
    }
    this.context.putImageData(this.pixels, 0, 0);
    delete currentFrame.shore;
    currentFrame.filled;
    currentFrame.computed = true;
    this.frameIndex++;
    currentFrame = this.frames[this.frameIndex];
    if (!currentFrame?.shore.length) { // animation done
      this.end = window.performance.now();
      this.runTime = this.end - this.start;
      const frameRate = ((Object.keys(this.frames).length - 1) / this.runTime * 1000).toFixed(2);
      log(`done in ${this.runTime} ms @ ${((Object.keys(this.frames).length - 1) / this.runTime * 1000).toFixed(2)} fps`);
      if (this.record) {
        log('cleaning frames...');
        cleanStart = window.performance.now();
        this.cleaner.postMessage({
          frames: this.frames
        });
      }
      else {
        this.locked = false;
        work.resolve();
      }
    }
    else {
      const frameTime = window.performance.now() - frameStart;
      skipTimeDiff = this.fps ? frameTime - idealFrameTime + skipTimeDiff : 0;
      computeNextFrame();
    }
  }
  const computeNextFrame = () => {
    frameStart = window.performance.now();
    if (!this.computeAhead) {
      assignWork();
    }
    window.requestAnimationFrame(checkFrameReady);
  }
  /*
   * Plays back interval of entries from the fill animation history.
   * start, end: interval of fill animation entries that will be played back;
   * simultaneous: if set to true will simultaneously play back history entries;
   * reverse: if set to true will play back animation(s) in reverse frame order;
   * */
  this.play = (start, end, simultaneous, reverse) => {
    let key;
    const playFrame = () => {
      let frameTime = window.performance.now() - this.player[key].frameStart;
      if (frameTime < idealFrameTime - this.player[key].skipTimeDiff) {
        window.requestAnimationFrame(playFrame);
        return;
      }
      for (let i = start; i <= end; i++) {
        const frame = this.history[i].frames[this.player[key].frameIndex];
        if (!frame) {
          continue;
        }
        const pixel = reverse ? this.history[i].blank : this.history[i].pixel;
        for (let i = 0; i < frame.filled.length; i++) {
          this.putPixel(frame.filled[i][0], frame.filled[i][1], pixel);
        }
      }
      this.context.putImageData(this.pixels, 0, 0);
      let done = false;
      if (reverse) {
        if (this.player[key].frameIndex > 0) {
          this.player[key].frameIndex--;
        }
        else {
          done = true;
        }
      }
      else {
        if (this.player[key].frameIndex + 1 <= this.player[key].lastIndex) {
          this.player[key].frameIndex++;
        }
        else {
          done = true;
        }
      }
      if (done) {
        const playTime = window.performance.now() - this.player[key].playStart;
        const frameRate = ((this.player[key].lastIndex + 1) / playTime * 1000).toFixed(2);
        log(`play done in ${playTime} ms @ ${frameRate} fps`);
        this.locked = false;
        this.player[key].resolve();
        this.player = {};
      }
      else {
        frameTime = window.performance.now() - this.player[key].frameStart;
        this.player[key].skipTimeDiff = this.fps ? frameTime - idealFrameTime + this.player[key].skipTimeDiff : 0;
        this.player[key].frameStart = window.performance.now();
        window.requestAnimationFrame(playFrame);
      }
    }
    return new Promise((resolve, reject) => {
      if (this.locked) {
        reject('locked; already playing');
        return;
      }
      if (!this.history[start] || (end > -1 && !this.history[end])) {
        reject('undefined history index');
        return;
      }
      if (end < start) {
        reject('end < start');
        return;
      }
      this.locked = true;
      idealFrameTime = this.fps ? 1000 / this.fps : 0;
      end = !this.history[end] ? start : end;
      key = simultaneous ? 'all' : `${start}, ${end}`;
      this.player[key] = {};
      this.player[key].playStart = window.performance.now();
      this.player[key].resolve = resolve;
      let lastIndex = 0;
      for (let i = start; i <= end; i++) {
        if (this.history[i].frames.length - 1 > lastIndex) {
          lastIndex = this.history[i].frames.length - 1;
        }
      }
      this.player[key].lastIndex = lastIndex;
      if (reverse) {
        this.player[key].frameIndex = lastIndex;
      }
      else {
        this.player[key].frameIndex = 0;
      }
      this.player[key].skipTimeDiff = 0;
      this.player[key].frameStart = window.performance.now();
      window.requestAnimationFrame(playFrame);
    });
  }
  this.undo = () => {
    return this.play(this.historyIndex, undefined, false, true)
    .then(() => {
      this.historyIndex--;
      return this.updateWorkers();
    });
  }
  this.redo = () => {
    return this.play(this.historyIndex + 1)
    .then(() => {
      this.historyIndex++;
      return this.updateWorkers();
    });
  }
  this.reset = () => {
    this.history = [];
    this.historyIndex = -1;
    this.frameIndex = 0;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.drawImage(this.image, 0, 0, this.canvas.width, this.canvas.height);
    this.pixels = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
    return this.updateWorkers();
  }
  this.fill = (x, y) => {
    return new Promise ((resolve, reject) => {
      if (this.locked) {
        reject('locked; already running');
        return;
      }
      idealFrameTime = this.fps ? 1000 / this.fps : 0;
      this.locked = true;
      work.resolve = resolve;
      work.reject = reject;
      this.frameIndex = 0;
      this.frames = [];
      this.historyIndex++;
      skipTimeDiff = 0;
      checkFrame(this.frameIndex);
      this.frames[this.frameIndex].shore = [[x, y]];
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
