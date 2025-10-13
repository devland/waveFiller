onmessage = (message) => {
  const done = {};
  const pixel = message.data.pixel;
  const blank = message.data.blank;
  const frames = message.data.frames;
  const history = message.data.history;
  let historyIndex = message.data.historyIndex;
  let totalFilled = 0;
  const output = [];
  for (let i = 0; i < frames.length; i++) {
    const filled = [];
    for (let pixel of frames[i].filled) {
      if (!done[pixel]) {
        filled.push(pixel);
        done[pixel] = true;
        totalFilled++;
      }
    }
    if (filled.length) {
      frames[i].filled = filled;
      output.push(frames[i]);
    }
  }
  if (frames.length) {
    history.splice(historyIndex, Infinity, {
      frames,
      totalFilled,
      pixel,
      blank
    });
    const sample = frames[0].filled[0];
    const toRemove = [];
    for (let i = 0; i < history.length - 1; i++) {
      let overwritten = false;
      for (let j = 0; j < history[i].frames.length; j++) {
        for (let k = 0; k < history[i].frames[j].filled.length; k++) {
          if (sample[0] == history[i].frames[j].filled[k][0] && sample[1] == history[i].frames[j].filled[k][1]) {
            overwritten = true;
            break;
          }
        }
        if (overwritten) {
          break;
        }
      }
      if (overwritten) {
        toRemove.push(i);
        continue;
      }
    }
    for (let index of toRemove) {
      history.splice(index, 1);
      if (index <= historyIndex) {
        historyIndex--;
      }
    }
  }
  else {
    historyIndex--;
  }
  postMessage({
    frames: output,
    totalFilled,
    history,
    historyIndex
  });
}
