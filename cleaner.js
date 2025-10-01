onmessage = (message) => {
  const done = {};
  const frames = message.data.frames;
  const output = [];
  for (let i = 0; i < frames.length; i++) {
    const filled = [];
    for (let pixel of frames[i].filled) {
      if (!done[pixel]) {
        filled.push(pixel);
        done[pixel] = true;
      }
    }
    if (filled.length) {
      frames[i].filled = filled;
      output.push(frames[i]);
    }
  }
  postMessage({ frames: output });
}
