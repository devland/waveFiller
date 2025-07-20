function waveFiller(options) {
  this.threshold = options.threshold || 20; // maximum deviance in color channell value allowed for a pixel to be considered blank
  this.blank = options.blank || [255, 255, 255, 255]; // white - set it to whatever color is considered blank in the image
  this.pixel = options.pixel || [255, 0, 0, 50]; // red - set it to whatever fill color you want as RGBA
  this.radius = options.radius || 50; // wave size in pixels rendered per frame
  this.fps = options.fps || 60; // frame limiter; the rendered frames per second will be limited to approximately this value; actual fps can be lower depending on your CPU
  this.workerCount = options.workerCount || Math.floor(window.navigator.hardwareConcurrency / 2); // number of web workers to be used
  this.minWorkerLoad = options.minWorkerLoad || 500; // minimum number of shore pixels, if more are available, to be assigned to a web worker
  this.computeAhead = options.computeAhead; // set to true to compute upcoming frames before current frame is done for faster overall rendering; warning: wave is no longer an advancing circle when filling large areas
  this.libraryPath = options.libraryPath || './' // path to library directory relative to current context
  this.silent = options.silent // set to true to disable console logs
  const frameTime = 1000 / this.fps;
  let skipFrame = false;
  const workerPromise = {
    resolve: () => {},
    reject: () => {},
    count: 0
  }
  this.initialize = () => {
    return new Promise ((resolve, reject) => {
      this.canvas = document.getElementById(options.canvasId);
      this.context = this.canvas.getContext('2d');
      let width = options.fit.width;
      let height = options.fit.height;
      this.image = new Image();
      this.image.src = options.imageSrc;
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
          const workerBlob = await (await fetch(`${options.libraryPath}worker.js`)).blob();
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
                pixels: this.pixels.data,
                done: {}
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
            pixels: this.pixels.data,
            done: {}
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
  const createFrame = (frame) => {
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
    if (this.assigning) {
      return;
    }
    this.assigning = true;
    const idleFrameIndex = getIdleFrameIndex(this.frame);
    if (idleFrameIndex < 0) {
      this.assigning = false;
      return;
    }
    const idleWorkers = getIdleWorkers();
    let assigned = 0;
    const idleFrame = this.frames[idleFrameIndex];
    const slice = Math.max(Math.ceil((idleFrame.shore.length - idleFrame.nextIdleShorePixel) / idleWorkers.length), this.minWorkerLoad);
    for (let i = 0; i < idleWorkers.length; i++) {
      const start = idleFrame.nextIdleShorePixel + slice * i;
      if (start > idleFrame.shore.length) {
        break;
      }
      const end = start + slice;
      const shore = idleFrame.shore.slice(start, end);
      if (!shore.length) {
        continue;
      }
      this.workers[i].working = true;
      this.workers[i].postMessage({
        type: 'work',
        input: {
          frame: idleFrameIndex,
          shore
        }
      });
      assigned += shore.length;
    }
    idleFrame.nextIdleShorePixel += assigned;
    this.assigning = false;
  }
  const handleWorkerDone = (output) => {
    this.workers[output.index].working = false;
    createFrame(output.frame + 1);
    const currentFrame = this.frames[this.frame];
    const outputFrame = this.frames[output.frame];
    const nextFrame = this.frames[output.frame + 1];
    outputFrame.worked += output.worked;
    nextFrame.shore = nextFrame.shore.concat(output.nextShore);
    outputFrame.filled = outputFrame.filled.concat(output.filled);
    if (this.computeAhead) {
      assignWork();
    }
  }
  const checkFrameReady = () => {
    if (skipFrame) {
      if (window.performance.now() - this.frameStart >= frameTime) {
        skipFrame = false;
      }
      window.requestAnimationFrame(checkFrameReady);
      return;
    }
    const currentFrame = this.frames[this.frame];
    if (currentFrame.worked == currentFrame.shore.length && (this.frame == 0 || this.frames[this.frame - 1].computed)) {
      const renderTime = window.performance.now() - this.frameStart;
      if (renderTime < frameTime) {
        skipFrame = true;
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
      computeNextFrame();
    }
  }
  const computeNextFrame = () => {
    this.frameStart = window.performance.now();
    if (!this.computeAhead) {
      assignWork();
    }
    window.requestAnimationFrame(checkFrameReady);
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
      createFrame(this.frame);
      this.frames[this.frame].shore = [[x, y]];
      this.start = window.performance.now();
      computeNextFrame();
      assignWork();
    });
  }
  this.click = (x, y) => { // computes x, y click event coordinates relative to canvas pixels
    const canvasScale = this.canvas.width / this.canvas.offsetWidth;
    x = Math.floor((x - this.canvas.offsetLeft) * canvasScale);
    y = Math.floor((y - this.canvas.offsetTop) * canvasScale);
    return this.fill(x, y);
  }
  log = (input) => {
    if (options.silent) {
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
