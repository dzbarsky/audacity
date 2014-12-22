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

  this.canvas = document.createElement("canvas");
  domElement.appendChild(this.canvas);

  this.canvas.width = 0;
  this.canvas.height = 100;
  this.canvas.style.border = '1px solid red';

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

  var canvasContext = this.canvas.getContext('2d');
  var oldWidth = this.canvas.width;
  if (oldWidth !== 0) {
    var data = canvasContext.getImageData(0, 0, this.canvas.width, this.canvas.height);
  }
  this.canvas.width += bufferSegment.length / SAMPLES_PER_PIXEL;

  if (oldWidth !== 0) {
    canvasContext.putImageData(data, 0, 0);
  }

  this.drawBuffer(canvasContext,
                  bufferSegment.getChannelData(0));
};

AudioTrack.prototype.drawBuffer = function(context, data) {
  var amp = this.canvas.height / 2;
  context.fillStyle = "silver";
  for (var i = 0; i < this.canvas.width - this.currentDrawn; i++){
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
  this.currentDrawn += data.length / SAMPLES_PER_PIXEL;
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

