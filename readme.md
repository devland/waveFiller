![image](waveFiller.png)

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
  canvas: document.getElementById('canvas'), // canvas DOM element to be used
  imageSrc: 'maze.png', // image to render in the canvas
  threshold: 60, // maximum deviance in color channel value allowed for a pixel to be considered blank
  blank: [255, 255, 255, 255], // white - set it to whatever color is considered blank in the image
  pixel: [255, 0, 0, 50], // red - set it to whatever fill color you want as RGBA
  radius: 20, // wave size in pixels rendered per frame
  fps: 60, // frame limiter (set to 0 to disable); actual fps can be lower depending on your CPU
  fit: {
    width: 900, // this will be the actual canvas width; height will be calculated relative to this width
    height: null // if set height will overwrite width as the dimension for resize reference; width will be calculated relative to this height
  },
  workerCount: 4, // number of web workers to be used
  minWorkerLoad: 100, // minimum number of shore pixels, if more are available, to be assigned to a web worker
  maxWorkerLoad: 200, // maximum number of shore pixels to be assigned to a worker (set to 0 to disable)
  computeAhead: true, // set to true to compute upcoming frames before current frame is done for faster overall rendering; warning: wave is no longer an advancing circle when filling large areas
  libraryPath: '../', // path to library directory relative to current context
  silent: false // set to true to disable console logs
});
```
2. Initialize the library.  
```javascript
window.addEventListener("load", async () => {
  const workerCount = await bucket.initialize();
  console.log(`yep, ${workerCount} workers are ready :)`);
  bucket.canvas.onclick = async (event) => {
    await bucket.click(event.clientX, event.clientY);
    console.log('yep; click fill is done');
  }
});
```
Now you can click within the canvas to trigger the animated bucket fill effect.  
3. Optionally, you can trigger the effect programatically by using the `fill` method like below.  
```javascript
window.addEventListener("load", async () => {
  const workerCount = await bucket.initialize();
  console.log(`yep, ${workerCount} workers are ready :)`);
  await bucket.fill(50, 50);
  console.log('yep; fill is done');
});
```
4. Remember to run the `updateWorkers` function if you change the instance settings so that the workers will run with them.  
For example, to change the `blank` and `pixel` values run the function below.  
```javascript
const changeColors = async () => {
  bucket.blank = [ 255, 0, 0, 50 ];
  bucket.pixel = [ 255, 255, 255, 255 ];
  await bucket.updateWorkers();
  console.log('colors have been changed');
}
```
[waveFillerDemo.webm](https://github.com/user-attachments/assets/1666c09d-dfda-4dfa-9921-8989713baf24)
