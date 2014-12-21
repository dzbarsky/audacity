window.addEventListener('load', setup);

var state;
var currentStream;
var context;
var currentTrackDiv;
var currentDrawn = 0;
var SAMPLES_PER_PIXEL = 200;
var finalBuffer;

function setup() {
  document.getElementById('record').addEventListener('click', toggleRecord);
  document.getElementById('play').addEventListener('click', play);
  document.getElementById('pause').addEventListener('click', pause);
}

function toggleRecord() {
  if (state === 'recording') {
    currentStream.stop();
    document.getElementById('record').src = 'images/record.png';
    state = 'stopped';
    createFinalBuffer();
  } else {
    document.getElementById('record').src = 'images/stop.png';
    state = 'recording';

    currentTrackDiv = document.createElement("div");
    document.getElementById('tracks').appendChild(currentTrackDiv);

    var canvas = document.createElement("canvas");
    currentTrackDiv.appendChild(canvas);

    canvas.width = 0;
    canvas.height = 100;
    canvas.style.border = '1px solid red';


    buffers = [];
    navigator.getUserMedia = navigator.getUserMedia || navigator.mozGetUserMedia;
    navigator.getUserMedia(
      { audio: true },
      success,
      function(err) {
        console.log("The following error occured: " + err);
      }
    );
   }
}

function createFinalBuffer() {

  var totalLength = 0;
  buffers.forEach(function (buffer) {
    totalLength += buffer.length;
  });

  finalBuffer = context.createBuffer(2, totalLength, buffers[0].sampleRate);
  for (var i = 0; i < 2; i++) {
    var channel = finalBuffer.getChannelData(i);

    var currentLength = 0;
    buffers.forEach(function (buffer) {
      channel.set(buffer.getChannelData(i), currentLength);
      currentLength += buffer.length;
    });
  }
}

function play() {
  var source = context.createBufferSource();
  source.buffer = finalBuffer;
  source.connect(context.destination);
  source.start();
}

var buffers = [];

function success(audioStream) {
  currentStream = audioStream;
  context = new AudioContext();

  //var volume = context.createGain();
  var streamSource = context.createMediaStreamSource(audioStream);

  var scriptProcessor = context.createScriptProcessor(4096, 2, 2);
  scriptProcessor.onaudioprocess = function(e) {
    if (state !== 'recording') {
      return;
    }
    buffers.push(e.inputBuffer);

    var canvas = currentTrackDiv.firstChild;

    var newCanvas = document.createElement("canvas");
    newCanvas.width = canvas.width + e.inputBuffer.length / SAMPLES_PER_PIXEL;
    newCanvas.height = canvas.height;
    canvas.remove();
    currentTrackDiv.appendChild(newCanvas);

    newCanvas.getContext('2d').drawImage(canvas, 0, 0);
    drawBuffer(newCanvas.width,
               newCanvas.height,
               newCanvas.getContext('2d'),
               e.inputBuffer.getChannelData(0));
  };

  streamSource.connect(scriptProcessor);
  scriptProcessor.connect(context.destination);
}

function drawBuffer(width, height, context, data) {
  var amp = height / 2;
  context.fillStyle = "silver";
  for (var i = 0; i < width - currentDrawn; i++){
    var min = 1.0;
    var max = -1.0;
    for (j = 0; j < SAMPLES_PER_PIXEL; j++) {
      var datum = data[(i * SAMPLES_PER_PIXEL) + j];
      if (datum < min)
        min = datum;
      if (datum > max)
        max = datum;
     }
     context.fillRect(i + currentDrawn, (1 + min) * amp,
                      1, Math.max(1, (max - min) * amp));
  }
  currentDrawn += data.length / SAMPLES_PER_PIXEL;
}
