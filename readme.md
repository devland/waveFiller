![image](waveFiller.png)

waveFiller - An animated bucket fill effect for the HTML 5 canvas.  
Written in vanilla javascript and optimized via web workers.  

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
  canvas: document.getElementById('canvas'), // canvas DOM element
  imageSrc: 'maze.png', // image to render in the canvas
  threshold: 60, // maximum deviance in color channel value allowed for a pixel to be considered blank
  margin: [0, 0, 0, 255], // black - set it to whatever color can never be filled in the image
  blank: [255, 255, 255, 255], // white - set it to whatever color can be filled in the image
  pixel: [255, 0, 0, 50], // red - set it to whatever fill color you want as RGBA
  radius: 20, // wave size in pixels rendered per frame
  fps: 60, // frame limiter (set to 0 to disable); actual fps can be lower depending on your CPU
  dimensions: {
    width: 900, // this will be the actual canvas width; height will be calculated relative to this width
    height: null // if set height will overwrite width as the dimension for resize reference; width will be calculated relative to this height
  },
  workerCount: 4, // number of web workers to be used
  minWorkerLoad: 100, // minimum number of shore pixels, if more are available, to be assigned to a web worker
  maxWorkerLoad: 200, // maximum number of shore pixels to be assigned to a worker (set to 0 to disable)
  computeAhead: true, // set to true to compute upcoming frames before current frame is done for faster overall rendering
  record: false, // set this to true to enable undo, redo & play functionality
  libraryPath: '../', // path to library directory relative to current context
  silent: false // set to true to disable console logs
});
```
2. Initialize the library.  
```javascript
const workerCount = await bucket.initialize();
console.log(`yep, ${workerCount} workers are ready :)`);
bucket.canvas.onclick = async (event) => {
  const setBlank = false; // set this to false if you don't want to overwrite the current blank color with the one that was clicked within the canvas
  await bucket.click(event.clientX, event.clientY, setBlank);
  console.log('yep; click fill is done');
}
```
Now you can click within the canvas to trigger the animated bucket fill effect.  
The optional `setBlank` parameter set to `true` automatically overwrites the `blank` value with the color that was clicked in the canvas.  
3. Optionally, you can trigger the effect programatically by using the `fill` method like below.  
```javascript
const workerCount = await bucket.initialize();
console.log(`yep, ${workerCount} workers are ready :)`);
await bucket.fill(50, 50);
console.log('yep; fill is done');
```
If you get the `forbidden: fill color ~ blank color` error this means that the `threshold` value you are using considers the fill and blank colors to be approximately equal and that is not allowed because, otherwise, the fill method will enter an infinite loop.  
# USAGE
4. Remember to run the `updateWorkers` function if you change the instance settings or if any other paint actions occur on the canvas outside of the `fill` or `click` methods.  
For example, to change the `blank` and `pixel` values run the function below.  
```javascript
const changeColors = async () => {
  bucket.blank = [ 255, 0, 0, 50 ];
  bucket.pixel = [ 255, 255, 255, 255 ];
  await bucket.updateWorkers();
  console.log('colors have been changed');
}
```
5. To reset the canvas to the initialized image run the `reset` async method.
```javascript
const resetCanvas = async () => {
  await bucket.reset();
  console.log('canvas has been reset');
}
```
6. To undo the last fill action run the `undo` async method. This will run the last fill animation in reverse.
```javascript
const undo = async () => {
  await bucket.undo();
  console.log('undo done');
}
```
7. To redo run the `redo` async method.
```javascript
const redo = async () => {
  await bucket.redo();
  console.log('redo done');
}
```
8. Both the undo and redo methods use the built in `play` method that allows you to play any fill action interval from the `history` array.  
To play history entries run the `play` async method with the desired start & end parameters.  
Remember to run `updateWorkers` after calling `play` so that the active workers receive the newly painted canvas.
```javascript
const play = async (start, end, simultaneous, reverse) => {
  /* 
   * start, end: interval of fill animation entries that will be played back;
   * simultaneous: if set to true will simultaneously play back history entries;
   * reverse: if set to true will play back animation(s) in reverse frame order;
   * */
  await bucket.play(start, end, simultaneous, reverse);
  await bucket.updateWorkers();
  console.log('play done');
}
```
9. You can playback all the fill actions by running the `timelapse` function like below.  
```javascript
const timelapse = async () => {
  await bucket.timelapse();
  console.log('timelapse done');
}
```
10. You can record and download a video of all canvas animations by running the `startRecording` and `stopRecording` functions like below.  
```javascript
const downloadVideo = () => {
  const link = document.createElement('a');
  link.download = `videoFileName.webm`;
  bucket.startRecording()
  .then((url) => {
    link.href = url;
    link.click();
  })
  .catch((error) => {
    console.log('recordVideo error');
    console.log(error);
  });
  bucket.timelapse()
  .then(() => {
    bucket.stopRecording();
  })
  .catch((error) => {
    console.log('timelapse error');
    console.log(error);
  });
}
```
The `undo`, `redo`, `play` and `timelapse` functions only work if the `record` config value is set to `true`.  
[waveFillerDemo.webm](https://github.com/user-attachments/assets/1666c09d-dfda-4dfa-9921-8989713baf24)
