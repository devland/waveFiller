function filler(options) {
  this.initialize = () => {
    this.canvas = document.getElementById(options.canvasId);
    this.context = this.canvas.getContext('2d');
    this.paint(1920, null, true);
    this.canvas.addEventListener('click', ((event) => {
      this.click(event.clientX, event.clientY);
    }));
  }
  this.paint = (width, height, resize) => {
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
      this.imageData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
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
  this.fit = () => {
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
    return this.context.getImageData(x, y, 1, 1).data;
  }
  this.fill = (x, y) => {
    this.context.save();
    this.context.fillStyle = 'red';
    this.context.fillRect(x, y, 1, 1);
    this.context.restore();
  }
  this.click = (x, y) => {
    this.cursor.x = parseInt((x - this.canvas.offsetLeft) * this.canvasScale);
    this.cursor.y = parseInt((y - this.canvas.offsetTop) * this.canvasScale);
    const pixel = this.getPixel(this.cursor.x, this.cursor.y);
    console.log(this.cursor.x, this.cursor.y, pixel);
    this.fill(this.cursor.x, this.cursor.y);
  }
}
