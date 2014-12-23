window.addEventListener('load', setup);

var state;
var context;
var SAMPLES_PER_PIXEL = 256;

var currentTrack;
var tracks = []
var nodes = {};

function AudioTrack() {
  var closeButton = document.createElement("div");
  closeButton.addEventListener('click', function() {
    trackControl.remove();
    canvasContainer.remove();
    tracks.splice(tracks.indexOf(this), 1);
  }.bind(this));
  closeButton.textContent = 'X';
  closeButton.classList.add('close-button');

  var trackControl = document.createElement("div");
  trackControl.classList.add('track-control');
  trackControl.appendChild(closeButton);
  document.getElementById('track-control-container').appendChild(trackControl);

  var canvasContainer = document.createElement('div');
  canvasContainer.track = this;
  canvasContainer.classList.add('canvas-container');
  document.getElementById('track-container').appendChild(canvasContainer);

  this.scrubber = document.createElement('div');
  this.scrubber.classList.add('scrubber');
  canvasContainer.appendChild(this.scrubber);

  this.canvases = [];
  for (var i = 0; i < 2; i++) {
    this.canvases.push(document.createElement("canvas"));
    canvasContainer.appendChild(this.canvases[i]);

    this.canvases[i].width = 0;
    this.canvases[i].height = 100;
  }

  this.buffers = [];
  this.currentDrawn = 0;
  this.finalBuffer = null;
}

AudioTrack.prototype.stopRecording = function() {
  var totalLength = 0;
  this.buffers.forEach(function (buffer) {
    totalLength += buffer.length;
  });

  this.finalBuffer = context.createBuffer(2, totalLength, this.buffers[0].sampleRate);
  for (var i = 0; i < 2; i++) {
    var channel = this.finalBuffer.getChannelData(i);

    var currentLength = 0;
    this.buffers.forEach(function (buffer) {
      channel.set(buffer.getChannelData(i), currentLength);
      currentLength += buffer.length;
    });
  }

  delete this.buffers;
};

AudioTrack.prototype.addBufferSegment = function(bufferSegment) {
  this.buffers.push(bufferSegment);

  for (var i = 0; i < 2; i++) {
    var canvasContext = this.canvases[i].getContext('2d');
    var oldWidth = this.canvases[i].width;
    if (oldWidth !== 0) {
      var data = canvasContext.getImageData(0, 0, this.canvases[i].width, this.canvases[i].height);
    }
    this.canvases[i].width += bufferSegment.length / SAMPLES_PER_PIXEL;

    if (oldWidth !== 0) {
      canvasContext.putImageData(data, 0, 0);
    }

    this.drawBuffer(canvasContext,
                    this.canvases[i].width,
                    bufferSegment.getChannelData(i));
  }

  this.currentDrawn += bufferSegment.length / SAMPLES_PER_PIXEL;
  this.scrubberIndex = 0;
};

AudioTrack.prototype.drawBuffer = function(context, width, data) {
  var amp = this.canvases[0].height / 2;
  context.fillStyle = "silver";

  var min = 1.0;
  var max = -1.0;
  var currentSample = 0;
  var currentPixel = this.currentDrawn;
  for (var i = 0; i < data.length; i++) {
    var datum = data[i];
    if (datum < min) {
      min = datum;
    }
    if (datum > max) {
      max = datum;
    }

    currentSample++;
    if (currentSample === SAMPLES_PER_PIXEL) {
      context.fillRect(currentPixel, (1 + min) * amp,
                       1, Math.max(1, (max - min) * amp));
      currentPixel++;
      currentSample = 0;
      min = 1.0;
      max = -1.0;
   }
  }
};

AudioTrack.prototype.play = function() {
  this.scriptProcessor = context.createScriptProcessor(SAMPLES_PER_PIXEL, 2, 2);
  this.scriptProcessor.onaudioprocess = function(e) {
    //console.log(e);
    var style = this.scrubber.style;
    var left = style.left;
    var leftNum = Number(left.substring(0, left.length - 2));

    if (leftNum < this.canvases[0].getBoundingClientRect().right) {
      style.left = leftNum + 1 + 'px';
    }

    for (var i = 0; i < 2; i++) {
      e.outputBuffer.copyToChannel(e.inputBuffer.getChannelData(i), i);
    }
  }.bind(this);
  this.scriptProcessor.connect(context.destination);

  this.source = context.createBufferSource();
  this.source.connect(this.scriptProcessor);
  this.source.connect(context.destination);
  this.source.onended = this.stop.bind(this);

  this.source.buffer = this.finalBuffer;
  var offsetIntoBuffer =
    this.scrubberIndex / this.finalBuffer.length * this.finalBuffer.duration;
  this.source.start(0, offsetIntoBuffer);
};

AudioTrack.prototype.stop = function() {
  console.log('stopping');
  this.scrubberIndex =
    Math.floor((this.scrubber.getBoundingClientRect().left -
                  this.canvases[0].offsetLeft) * SAMPLES_PER_PIXEL);
  this.source.disconnect(this.scriptProcessor);
  this.scriptProcessor.disconnect(context.destination);
  this.source.stop();
};

AudioTrack.prototype.setScrubberPosition = function(pos) {
  this.scrubber.style.left = pos + 'px';
  this.scrubberIndex = (pos - this.canvases[0].offsetLeft) * SAMPLES_PER_PIXEL;
};

function setup() {
  document.getElementById('record').addEventListener('click', toggleRecord);
  document.getElementById('play').addEventListener('click', play);
  document.getElementById('pause').addEventListener('click', pause);
  document.getElementById('track-container').addEventListener('click', clickTrackHandler);

  document.body.addEventListener('keydown', keydown);
  navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia || navigator.webkitGetUserMedia;
  navigator.getUserMedia(
    { audio: true },
    success,
    function(err) {
      console.log("The following error occured: " + err);
    }
  );
 }

function toggleRecord() {
  if (state === 'recording') {
    state = 'stopped';
    document.getElementById('record').src = 'images/record.png';
    currentTrack.stopRecording();

    nodes.streamSource.disconnect(nodes.scriptProcessor);
    nodes.scriptProcessor.disconnect(context.destination);
  } else {
    state = 'recording';
    document.getElementById('record').src = 'images/stop.png';
    currentTrack = new AudioTrack();
    tracks.push(currentTrack);

    nodes.streamSource.connect(nodes.scriptProcessor);
    nodes.scriptProcessor.connect(context.destination);
    // Should play back the other tracks here as you record.  Currently causes
    // problems.
    //play();
  }
}

function keydown(e) {
  console.log(e);

  // Space
  if (e.keyCode === 32) {
    if (state === 'stopped') {
      play();
    } else if (state === 'playing'){
      stop();
    }
  }
}

function stop() {
  state = 'stopped';
  tracks.forEach(function(track) {
    track.stop();
  });
}

function play() {
  state = 'playing';
  tracks.forEach(function(track) {
    track.play();
  });
}

function success(audioStream) {
  context = new AudioContext();

  //var volume = context.createGain();
  nodes.streamSource = context.createMediaStreamSource(audioStream);
  nodes.scriptProcessor = context.createScriptProcessor(4096, 2, 2);
  nodes.scriptProcessor.onaudioprocess = function(e) {
    if (state === 'recording') {
      currentTrack.addBufferSegment(e.inputBuffer);
    }
  };
}

function clickTrackHandler(e) {
  tracks.forEach(function (track) {
    track.setScrubberPosition(e.clientX);
  });
}
