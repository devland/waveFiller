An animated bucket fill effect for the HTML 5 canvas.  
Written in javascript and optimized via web workers.  

For a live demo go to https://devland.github.io/waveFiller/demo/ and click within the empty image areas to trigger the bucket fill animation.  

# SETUP

0. Create an HTML page with a canvas and load the waveFiller library like below.  
Refer to the [demo/index.html](demo/index.html) file for a working example.  
```html
<html>
  <head>
    <script type="text/javascript" src="waveFiller/index.js"></script>
  </head>
  <body>
    <canvas class="canvas" id="canvas"></canvas>
  </body>
</html>
```
1. Instantiate the library.  
```javascript
const bucket = new waveFiller({
  canvasId: 'canvas', // canvad DOM id to be used
  imageSrc: 'maze.png', // image to render in the canvas
  threshold: 60, // maximum deviance in color channell value allowed for a pixel to be considered blank
  blank: [255, 255, 255, 255], // white - set it to whatever color is considered blank in the image
  pixel: [255, 0, 0, 50], // red - set it to whatever fill color you want as RGBA
  radius: 50, // wave size in pixels rendered per frame
  fps: 30, // frame limiter; the rendered frames per second will be limited to approximately this value; actual fps can be lower depending on your CPU
  fit: {
    width: 600, // this will be the actual canvas width; height will be calculated relative to this width
    height: null // if set height will overwrite width as the dimension for resize reference; width will be calculated relative to this height
  },
  workerCount: 4, // number of web workers to be used
  minWorkerLoad: 500, // minimum number of shore pixels, if more are available, to be assigned to a web worker
  computeAhead: true, // set to true to compute upcoming frames before current frame is done for faster overall rendering; warning: wave is no longer an advancing circle when filling large areas
  libraryPath: '../', // path to library directory relative to current context
  silent: false // set to true to disable console logs
});
```
2. Initialize the library.  
```javascript
window.addEventListener("load", () => {
  bucket.initialize() // initialize the library and its web workers once the page finishes loading
    .then((result) => {
      bucket.canvas.onclick = (event) => { // attach a click event to trigger the fill animation after initialization is complete
        bucket.click(event.clientX, event.clientY);
      }
    })
    .catch((error) => {
      console.log('oops; error...');
    });
});
```
Now you can click within the canvas to trigger the animated bucket fill effect.  
3. Optionally you can trigger the effect programatically by using the `fill` method like below.  
```javascript
window.addEventListener("load", () => {
  bucket.initialize() // initialize the library and its web workers once the page finishes loading
    .then((result) => {
      bucket.fill(50, 50); // trigger the effect from the provided (x, y) coordinates within the canvas
    })
    .catch((error) => {
      console.log('oops; error...');
    });
});
```
