function filler(options) {
  this.threshold = options.threshold || 20; // maximum deviance in color channell value allowed for a pixel to be considered blank
  this.blank = options.blank || [255, 255, 255, 255]; // white - set it to whatever color is considered blank in the image
  this.pixel = options.pixel || [255, 0, 0, 50]; //red - set it to whatever fill color you want as RGBA
  this.radius = options.radius || 50; // wave size in pixels rendered per frame
  this.fps = options.fps || 60; // frame limiter; the rendered frames per second will be limited to approximately this value; actual fps can be lower depending on your CPU
  this.workerCount = options.workerCount || window.navigator.hardwareConcurrency - 1; // number of web workers to be used
  this.initialize = async () => {
    this.canvas = document.getElementById(options.canvasId);
    this.context = this.canvas.getContext('2d');
    this.paint(options.fit.width, options.fit.height, options.fit.resize);
    this.canvas.addEventListener('click', ((event) => {
      this.click(event.clientX, event.clientY);
    }));
  }
  this.paint = (width, height, resize) => { // paint image in canvas
    this.image = new Image();
    this.image.src = options.imageSrc;
    this.image.onload = async () => {
      try {
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
        this.workers = [];
        this.worked = 0;
        const workerBlob = await (await fetch(`${options.workerPath}worker.js`)).blob();
        for (let index = 0; index < this.workerCount; index++) {
          const worker = new Worker(URL.createObjectURL(workerBlob));
          worker.onmessage = (message) => {
            switch (message.data.status) {
              case 'initDone':
                this.worked++;
                if (this.worked == this.workerCount) {
                  console.log(`web worker init done; ${this.worked} web workers ready`);
                }
              break;
              case 'done':
                this.handleWorkerDone(message.data.output);
              break;
            }
          }
          worker.onerror = (error) => {
            console.log(`worker ${index} error`);
            console.log(error);
          }
          worker.onmessageerror = (error) => {
            console.log(`worker ${index} message error`);
            console.log(error);
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
        console.log('initialize error');
        console.log(error);
      }
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
  this.putPixel = (x, y) => {
    const start = (y * this.canvas.width + x) * 4;
    this.pixels.data[start] = this.pixel[0];
    this.pixels.data[start + 1] = this.pixel[1];
    this.pixels.data[start + 2] = this.pixel[2];
    this.pixels.data[start + 3] = this.pixel[3];
  }
  this.getWorkerShores = () => { // assign shore pixels to workers
    this.workerShores = [];
    for (let i = 0; i < this.workerCount; i++) {
      this.workerShores.push([]);
    }
    let worker = 0;
    let working = 0;
    for (let item of this.nextShore) {
      this.workerShores[worker].push(item);
      worker++;
      if (working < this.workerCount) {
        working++;
      }
      if (worker > this.workerCount - 1) {
        worker = 0;
      }
    }
    return working;
  }
  this.parseShoreWithWorkers = () => {
    this.worked = 0;
    this.working = this.getWorkerShores();
    for (let i = 0; i < this.workerShores.length; i++) {
      if (this.workerShores[i].length) {
        this.workers[i].postMessage({
          type: 'work',
          input: {
            nextShore: this.workerShores[i]
          }
        });
      }
    }
  }
  this.handleWorkerDone = (output) => {
    if (this.worked == 0) {
      this.nextShore = [];
      this.filled = [];
    }
    this.worked++;
    this.nextShore = this.nextShore.concat(output.nextShore);
    this.filled = this.filled.concat(output.filled);
    this.done = {...this.done, ...output.done};
    if (this.worked == this.working) {
      for (let item of this.filled) {
        this.putPixel(item[0], item[1]);
      }
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
    this.parseShoreWithWorkers();
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
    this.start = window.performance.now();
    this.compute();
  }
}
