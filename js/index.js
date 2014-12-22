window.addEventListener('load', setup);

var state;
var context;
var SAMPLES_PER_PIXEL = 200;

var currentTrack;
var tracks = []
var nodes = {};

function AudioTrack() {
  var domElement = document.createElement("div");
  document.getElementById('tracks').appendChild(domElement);

  var closeButton = document.createElement("div");
  closeButton.addEventListener('click', function() {
    domElement.remove();
    tracks.splice(tracks.indexOf(this), 1);
  }.bind(this));
  closeButton.textContent = 'X';
  closeButton.classList.add('close-button');

  var leftBar = document.createElement("div");
  leftBar.classList.add('left-bar');
  leftBar.appendChild(closeButton);
  domElement.appendChild(leftBar);

  var canvasContainer = document.createElement('div');
  canvasContainer.classList.add('canvas-container');
  domElement.appendChild(canvasContainer);
  this.canvases = [];
  for (var i = 0; i < 2; i++) {
    this.canvases.push(document.createElement("canvas"));
    canvasContainer.appendChild(this.canvases[i]);

    this.canvases[i].width = 0;
    this.canvases[i].height = 100;
    this.canvases[i].style.border = '1px solid red';
    this.canvases[i].style.display = 'block';
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
};

AudioTrack.prototype.drawBuffer = function(context, width, data) {
  var amp = this.canvases[0].height / 2;
  context.fillStyle = "silver";
  console.log(width - this.currentDrawn)
  for (var i = 0; i < width - this.currentDrawn; i++){
    var min = 1.0;
    var max = -1.0;
    for (j = 0; j < SAMPLES_PER_PIXEL; j++) {
      var datum = data[(i * SAMPLES_PER_PIXEL) + j];
      if (datum < min)
        min = datum;
      if (datum > max)
        max = datum;
     }
     context.fillRect(i + this.currentDrawn, (1 + min) * amp,
                      1, Math.max(1, (max - min) * amp));
  }
};

AudioTrack.prototype.play = function() {
  var source = context.createBufferSource();
  source.buffer = this.finalBuffer;
  source.connect(context.destination);
  source.start();
};

function setup() {
  document.getElementById('record').addEventListener('click', toggleRecord);
  document.getElementById('play').addEventListener('click', play);
  document.getElementById('pause').addEventListener('click', pause);
  document.getElementById('tracks').addEventListener('click', clickTrackHandler);

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
    play();
  }
}

function play() {
  var playStart = Date.now();
  tracks.forEach(function(track) {
    track.play();
  });

  var animateScrubber = function() {
    var elapsed = Date.now() - playStart;
    document.getElementById('scrubber').style.left =
      elapsed /1000 * SAMPLES_PER_PIXEL + 'px';
    requestAnimationFrame(animateScrubber);
  };
  requestAnimationFrame(animateScrubber);
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
  console.log(e);
  document.getElementById('scrubber').style.left = e.clientX + 'px';
}
