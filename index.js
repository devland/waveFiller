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
  this.initialize = () => {
    return new Promise (async (resolve, reject) => {
      try {
        this.canvas = document.getElementById(options.canvasId);
        this.context = this.canvas.getContext('2d');
        let width = options.fit.width;
        let height = options.fit.height;
        this.image = new Image();
        this.image.src = options.imageSrc;
        this.image.onload = async () => {
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
          let initialized = 0;
          const workerBlob = await (await fetch(`${options.libraryPath}worker.js`)).blob();
          for (let index = 0; index < this.workerCount; index++) {
            const worker = new Worker(URL.createObjectURL(workerBlob));
            worker.working = false;
            worker.onmessage = (message) => {
              switch (message.data.status) {
                case 'initDone':
                  initialized++;
                  if (initialized == this.workerCount) {
                    this.log(`web worker init done; ${initialized} web workers ready`);
                    resolve(initialized);
                  }
                break;
                case 'done':
                  this.handleWorkerDone(message.data.output);
                break;
              }
            }
            worker.onerror = (error) => {
              this.log([`worker ${index} error`, error]);
            }
            worker.onmessageerror = (error) => {
              this.log([`worker ${index} message error`, error]);
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
      }
      catch (error) {
        this.log(['initialize error', error]);
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
  this.createFrame = (frame) => {
    if (!this.frames[frame]) {
      this.frames[frame] = {
        shore: [],
        worked: 0,
        nextIdleShorePixel: 0,
        filled: []
      }
    }
  }
  this.getIdleWorkers = () => {
    const idle = [];
    for (let i = 0; i < this.workerCount; i++) {
      if (!this.workers[i].working) {
        idle.push(i);
      }
    }
    return idle;
  }
  this.getIdleFrameIndex = (frame) => {
    while (this.frames[frame]) {
      if (this.frames[frame].nextIdleShorePixel < this.frames[frame].shore.length) {
        return frame;
      }
      frame++;
    }
    return -1;
  }
  this.assignWork = () => {
    if (this.assigning) {
      return;
    }
    this.assigning = true;
    const idleFrameIndex = this.getIdleFrameIndex(this.frame);
    if (idleFrameIndex < 0) {
      this.assigning = false;
      return;
    }
    const idleWorkers = this.getIdleWorkers();
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
  this.handleWorkerDone = (output) => {
    this.workers[output.index].working = false;
    this.createFrame(output.frame + 1);
    const currentFrame = this.frames[this.frame];
    const outputFrame = this.frames[output.frame];
    const nextFrame = this.frames[output.frame + 1];
    outputFrame.worked += output.worked;
    nextFrame.shore = nextFrame.shore.concat(output.nextShore);
    outputFrame.filled = outputFrame.filled.concat(output.filled);
    if (this.computeAhead) {
      this.assignWork();
    }
  }
  this.checkFrameReady = () => {
    if (skipFrame) {
      if (window.performance.now() - this.frameStart >= frameTime) {
        skipFrame = false;
      }
      window.requestAnimationFrame(this.checkFrameReady);
      return;
    }
    const currentFrame = this.frames[this.frame];
    if (currentFrame.worked == currentFrame.shore.length && (this.frame == 0 || this.frames[this.frame - 1].computed)) {
      const renderTime = window.performance.now() - this.frameStart;
      if (renderTime < frameTime) {
        skipFrame = true;
        window.requestAnimationFrame(this.checkFrameReady);
      }
      else {
        this.paintFrame();
      }
    }
    else {
      window.requestAnimationFrame(this.checkFrameReady);
    }
  }
  this.paintFrame = () => {
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
      this.log(`done in ${this.runTime} ms @ ${((Object.keys(this.frames).length - 1) / this.runTime * 1000).toFixed(2)} fps`);
      this.locked = false;
    }
    else {
      this.computeNextFrame();
    }
  }
  this.computeNextFrame = () => {
    this.frameStart = window.performance.now();
    if (!this.computeAhead) {
      this.assignWork();
    }
    window.requestAnimationFrame(this.checkFrameReady);
  }
  this.fill = (x, y) => {
    if (this.locked) {
      this.log('locked; already running');
      return;
    }
    this.locked = true;
    this.frame = 0;
    this.frames = {};
    this.createFrame(this.frame);
    this.frames[this.frame].shore = [[x, y]];
    this.start = window.performance.now();
    this.computeNextFrame();
    this.assignWork();
  }
  this.click = (x, y) => { // computes x, y click event coordinates relative to canvas pixels
    const canvasScale = this.canvas.width / this.canvas.offsetWidth;
    x = Math.floor((x - this.canvas.offsetLeft) * canvasScale);
    y = Math.floor((y - this.canvas.offsetTop) * canvasScale);
    this.fill(x, y);
  }
  this.log = (input) => {
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
