var AudioEditorTrack = (function () {
    function AudioEditorTrack() {
        var _this = this;
        var closeButton = document.createElement("div");
        closeButton.addEventListener('click', function () {
            trackControl.remove();
            canvasContainer.remove();
            tracks.splice(tracks.indexOf(_this), 1);
        });
        closeButton.textContent = 'X';
        closeButton.classList.add('close-button');
        var muteButton = document.createElement("div");
        muteButton.addEventListener('click', function () {
            _this.muted = !_this.muted;
            if (_this.muted) {
                _this.volumeControl.gain.value = 0;
                muteButton.textContent = 'Unmute';
            }
            else {
                _this.volumeControl.gain.value = 1;
                muteButton.textContent = 'Mute';
            }
        });
        muteButton.textContent = 'Mute';
        muteButton.classList.add('mute-button');
        var trackControl = document.createElement("div");
        trackControl.classList.add('track-control');
        trackControl.appendChild(closeButton);
        trackControl.appendChild(muteButton);
        document.getElementById('track-control-container').appendChild(trackControl);
        var canvasContainer = document.createElement('div');
        canvasContainer.addEventListener("mousedown", mousedownCanvasHandler);
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
        this.volumeControl = context.createGain();
        this.muted = false;
        this.buffers = [];
        this.currentDrawn = 0;
        this.finalBuffer = null;
        this.canvasImageData = [];
    }
    AudioEditorTrack.prototype.stopRecording = function () {
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
    AudioEditorTrack.prototype.addBufferSegment = function (bufferSegment) {
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
            this.drawBuffer(canvasContext, this.canvases[i].width, bufferSegment.getChannelData(i));
        }
        this.currentDrawn += bufferSegment.length / SAMPLES_PER_PIXEL;
        this.scrubberIndex = 0;
    };
    AudioEditorTrack.prototype.drawBuffer = function (context, width, data) {
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
                context.fillRect(currentPixel, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
                currentPixel++;
                currentSample = 0;
                min = 1.0;
                max = -1.0;
            }
        }
    };
    AudioEditorTrack.prototype.play = function () {
        this.scriptProcessor = context.createScriptProcessor(SAMPLES_PER_PIXEL, 2, 2);
        this.scriptProcessor.onaudioprocess = function (e) {
            //console.log(e);
            var style = this.scrubber.style;
            var left = style.left;
            var leftNum = Number(left.substring(0, left.length - 2));
            if (leftNum < this.canvases[0].getBoundingClientRect().right) {
                style.left = leftNum + 1 + 'px';
            }
        }.bind(this);
        this.source = context.createBufferSource();
        this.source.connect(this.scriptProcessor);
        this.source.connect(this.volumeControl);
        this.volumeControl.connect(context.destination);
        this.source.onended = this.stop.bind(this);
        this.source.buffer = this.finalBuffer;
        var offsetIntoBuffer = this.scrubberIndex / this.finalBuffer.length * this.finalBuffer.duration;
        this.source.start(0, offsetIntoBuffer);
    };
    AudioEditorTrack.prototype.stop = function () {
        console.log('stopping');
        this.scrubberIndex = Math.floor((this.scrubber.getBoundingClientRect().left - this.canvases[0].offsetLeft) * SAMPLES_PER_PIXEL);
        this.source.disconnect(this.scriptProcessor);
        this.source.disconnect(this.volumeControl);
        this.volumeControl.disconnect(context.destination);
        this.source.stop();
    };
    AudioEditorTrack.prototype.setScrubberPosition = function (pos) {
        this.scrubber.style.left = pos + 'px';
        this.scrubberIndex = this.pixelToArrayPosition(pos);
    };
    AudioEditorTrack.prototype.startHighlight = function (pos) {
        this.highlightStartPosition = (pos - this.canvases[0].offsetLeft);
        for (var i = 0; i < 2; i++) {
            var canvas = this.canvases[i];
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = 'blue';
            ctx.globalAlpha = 0.2;
            this.canvasImageData[i] = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
    };
    AudioEditorTrack.prototype.updateHighligh = function (pos) {
        this.highlightEndPosition = (pos - this.canvases[0].offsetLeft);
        for (var i = 0; i < 2; i++) {
            var canvas = this.canvases[i];
            var ctx = canvas.getContext('2d');
            ctx.putImageData(this.canvasImageData[i], 0, 0);
            ctx.fillRect(this.highlightStartPosition, 0, this.highlightEndPosition - this.highlightStartPosition, canvas.height);
        }
    };
    AudioEditorTrack.prototype.pixelToArrayPosition = function (pos) {
        return (pos - this.canvases[0].offsetLeft) * SAMPLES_PER_PIXEL;
    };
    return AudioEditorTrack;
})();
;
var State;
(function (State) {
    State[State["Playing"] = 0] = "Playing";
    State[State["Recording"] = 1] = "Recording";
    State[State["Stopped"] = 2] = "Stopped";
})(State || (State = {}));
var SAMPLES_PER_PIXEL = 256;
var state;
var context;
var currentTrack;
var tracks = [];
var nodes = {};
window.addEventListener('load', setup);
function setup() {
    document.getElementById('record').addEventListener('click', toggleRecord);
    document.getElementById('play').addEventListener('click', togglePlayState);
    document.getElementById('pause').addEventListener('click', togglePlayState);
    document.getElementById('track-container').addEventListener('mousedown', clickTrackHandler);
    document.body.addEventListener('keydown', keydown);
    var n = navigator;
    n.getUserMedia = n.getUserMedia || n.mozGetUserMedia || n.webkitGetUserMedia;
    n.getUserMedia({
        audio: true
    }, success, function (err) {
        console.log("The following error occured: " + err);
    });
}
function toggleRecord() {
    if (state === 1 /* Recording */) {
        state = 2 /* Stopped */;
        document.getElementById('record').src = 'images/record.png';
        currentTrack.stopRecording();
        nodes.streamSource.disconnect(nodes.scriptProcessor);
        nodes.scriptProcessor.disconnect(context.destination);
    }
    else {
        state = 1 /* Recording */;
        document.getElementById('record').src = 'images/stop.png';
        currentTrack = new AudioEditorTrack();
        tracks.push(currentTrack);
        nodes.streamSource.connect(nodes.scriptProcessor);
        nodes.scriptProcessor.connect(context.destination);
    }
}
function keydown(e) {
    console.log(e);
    // Space
    if (e.keyCode === 32) {
        togglePlayState();
    }
}
function togglePlayState() {
    if (state === 2 /* Stopped */) {
        play();
    }
    else if (state === 0 /* Playing */) {
        stop();
    }
}
function stop() {
    state = 2 /* Stopped */;
    tracks.forEach(function (track) {
        track.stop();
    });
}
function play() {
    state = 0 /* Playing */;
    tracks.forEach(function (track) {
        track.play();
    });
}
function success(audioStream) {
    context = new AudioContext();
    //var volume = context.createGain();
    nodes.streamSource = context.createMediaStreamSource(audioStream);
    nodes.scriptProcessor = context.createScriptProcessor(4096, 2, 2);
    nodes.scriptProcessor.onaudioprocess = function (e) {
        if (state === 1 /* Recording */) {
            currentTrack.addBufferSegment(e.inputBuffer);
        }
    };
}
function clickTrackHandler(e) {
    tracks.forEach(function (track) {
        track.setScrubberPosition(e.clientX);
    });
}
function mousedownCanvasHandler(e) {
    console.log("mouse down");
    this.track.startHighlight(e.clientX);
    this.addEventListener("mouseup", mouseupCanvasHandler);
    this.addEventListener("mousemove", mousemoveCanvasHandler);
}
function mouseupCanvasHandler(e) {
    console.log("mouse up");
    this.removeEventListener("mouseup", mouseupCanvasHandler);
    this.removeEventListener("mousemove", mousemoveCanvasHandler);
}
function mousemoveCanvasHandler(e) {
    this.track.updateHighligh(e.clientX);
    console.log("mouse move!!: " + e);
}
