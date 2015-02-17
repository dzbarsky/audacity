declare var AudioContext

interface AudioBuffer {
    length: number;
    sampleRate: number;
    duration: number;
    getChannelData(channel: number): Float32Array;

}

interface HTMLElement {
    remove(): void;
}

interface AudioNode {
    onaudioprocess: Function;
    connect(node: AudioNode): void;
    disconnect(node: AudioNode): void;
    onended: Function;
    start(when ? : number, offset ? : number);
    buffer: AudioBuffer;
    gain: any;
    stop(when ? : number)
}

class AudioTrackVisualization {

    currentDrawn: number;
    canvases: HTMLCanvasElement[];
    scrubber: HTMLDivElement;
    scrubberIndex: number;

    canvasContainer: HTMLDivElement;

    canvasWithoutHighlight: ImageData[];
    track: AudioEditorTrack;

    highlightStartPosition: number;
    highlightEndPosition: number;

    constructor(track: AudioEditorTrack) {
        this.canvasContainer = document.createElement('div');
        this.canvasContainer.addEventListener("mousedown", mousedownCanvasHandler);
        (<any>this.canvasContainer).track = track;
        this.track = track;
        this.canvasContainer.classList.add('canvas-container');
        document.getElementById('track-container').appendChild(this.canvasContainer);

        this.scrubber = document.createElement('div');
        this.scrubber.classList.add('scrubber');
        this.canvasContainer.appendChild(this.scrubber);

        this.canvases = [];
        for (var i = 0; i < 2; i++) {
            this.canvases.push(document.createElement("canvas"));
            this.canvasContainer.appendChild(this.canvases[i]);

            this.canvases[i].width = 0;
            this.canvases[i].height = 100;
        }

        this.canvasWithoutHighlight = [];

        this.currentDrawn = 0;
    }

    remove() {
        this.canvasContainer.remove();
    }

    addBufferSegment(bufferSegment: AudioBuffer) {
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
    }

    drawBuffer(context: CanvasRenderingContext2D, width: number, data: Float32Array) {
        var amp = this.canvases[0].height / 2;
        context.globalAlpha = 1.0;
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
    }

    advanceScrubber() {
        var style = this.scrubber.style;
        var left = style.left;
        var leftNum = Number(left.substring(0, left.length - 2));

        if (leftNum < this.canvases[0].getBoundingClientRect().right) {
            style.left = leftNum + 1 + 'px';
        }

        this.scrubberIndex = Math.floor(leftNum + 1 - this.canvases[0].offsetLeft) * SAMPLES_PER_PIXEL;
    }

    setScrubberPosition(pos: number) {
        this.scrubber.style.left = pos + 'px';
        this.scrubberIndex = this.pixelToArrayPosition(pos);
    }

    drawAudioBuffer() {
        for (var i = 0; i < 2; i++) {
            var canvas = this.canvases[i];
            var ctx = this.canvases[i].getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            this.currentDrawn = 0;
            this.drawBuffer(ctx, canvas.width, this.track.finalBuffer.getChannelData(i));
            this.canvasWithoutHighlight[i] = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
    }

    startHighlight(pos: number) {
        this.highlightStartPosition = (pos - this.canvases[0].offsetLeft);
        for (var i = 0; i < 2; i++) {
            var canvas = this.canvases[i];
            var ctx = canvas.getContext('2d');

            // Restore image data to clear previous highlight.
            if (this.canvasWithoutHighlight[i]) {
                ctx.putImageData(this.canvasWithoutHighlight[i], 0, 0);
            }

            ctx.fillStyle = 'blue';
            ctx.globalAlpha = 0.2;
            this.canvasWithoutHighlight[i] = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
    }

    updateHighlight(pos: number) {
        this.highlightEndPosition = (pos - this.canvases[0].offsetLeft);
        for (var i = 0; i < 2; i++) {
            var canvas = this.canvases[i];
            var ctx = canvas.getContext('2d');
            ctx.putImageData(this.canvasWithoutHighlight[i], 0, 0);
            ctx.fillRect(this.highlightStartPosition, 0,
                         this.highlightEndPosition - this.highlightStartPosition, canvas.height);
        }

    }

    pixelToArrayPosition(pos: number) {
        return (pos - this.canvases[0].offsetLeft) * SAMPLES_PER_PIXEL;
    }
}

class AudioEditorTrack {

    muted: boolean;
    buffers: AudioBuffer[];
    visual: AudioTrackVisualization;
    finalBuffer: AudioBuffer;

    scriptProcessor: AudioNode;
    volumeControl: AudioNode;
    source: AudioNode;

    constructor() {
        var closeButton = document.createElement("div");
        closeButton.addEventListener('click', () => {
            trackControl.remove();
            this.visual.remove();
            tracks.splice(tracks.indexOf(this), 1);
        });
        closeButton.textContent = 'X';
        closeButton.classList.add('close-button');

        var muteButton = document.createElement("div");
        muteButton.addEventListener('click', () => {

            this.muted = !this.muted;
            if (this.muted) {
                this.volumeControl.gain.value = 0;
                muteButton.textContent = 'Unmute';
            } else {
                this.volumeControl.gain.value = 1;
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

        this.visual = new AudioTrackVisualization(this);

        this.volumeControl = context.createGain();
        this.muted = false;
        this.buffers = [];
        this.finalBuffer = null;
    }

    stopRecording() {
        var totalLength = 0;
        this.buffers.forEach(function(buffer) {
            totalLength += buffer.length;
        });

        this.finalBuffer = context.createBuffer(2, totalLength, this.buffers[0].sampleRate);
        for (var i = 0; i < 2; i++) {
            var channel = this.finalBuffer.getChannelData(i);

            var currentLength = 0;
            this.buffers.forEach(function(buffer) {
                channel.set(buffer.getChannelData(i), currentLength);
                currentLength += buffer.length;
            });
        }

        delete this.buffers;
    }

    addBufferSegment(bufferSegment: AudioBuffer) {
        this.buffers.push(bufferSegment);
        this.visual.addBufferSegment(bufferSegment);
    }

    play() {
        this.scriptProcessor = context.createScriptProcessor(SAMPLES_PER_PIXEL, 2, 2);
        this.scriptProcessor.onaudioprocess = this.visual.advanceScrubber.bind(this.visual);

        this.source = context.createBufferSource();
        this.source.connect(this.scriptProcessor);
        this.source.connect(this.volumeControl);
        this.volumeControl.connect(context.destination);

        this.source.onended = this.stop.bind(this);

        this.source.buffer = this.finalBuffer;
        var offsetIntoBuffer =
            this.visual.scrubberIndex / this.finalBuffer.length * this.finalBuffer.duration;
        this.source.start(0, offsetIntoBuffer);
    }

    stop() {
        this.source.disconnect(this.scriptProcessor);
        this.source.disconnect(this.volumeControl);
        this.volumeControl.disconnect(context.destination);
        this.source.stop();
    }
    setScrubberPosition(pos: number) {
        this.visual.setScrubberPosition(pos);
    }
    startHighlight(pos: number) {
        this.visual.startHighlight(pos);
    }
    updateHighlight(pos: number) {
        this.visual.updateHighlight(pos);
    }

    deleteSelection() {
        var endIndex = this.visual.highlightEndPosition * SAMPLES_PER_PIXEL;
        var startIndex = this.visual.highlightStartPosition * SAMPLES_PER_PIXEL;
        var newLength = this.finalBuffer.length - (endIndex - startIndex);
        var newBuffer = context.createBuffer(2, newLength, this.finalBuffer.sampleRate);
        for (var i = 0; i < 2; i++) {
            newBuffer.getChannelData(i).set([].slice.call(this.finalBuffer.getChannelData(i), 0, startIndex));
            newBuffer.getChannelData(i).set([].slice.call(this.finalBuffer.getChannelData(i), endIndex), startIndex);
        }

        this.finalBuffer = newBuffer;
        this.visual.drawAudioBuffer();
    }
};

enum State {
    Playing,
    Recording,
    Stopped
}

var SAMPLES_PER_PIXEL = 256;
var state: State;
var context: any;

var currentTrack: AudioEditorTrack;
var tracks: AudioEditorTrack[] = [];
var nodes: any = {};
window.addEventListener('load', setup);

function setup() {
    document.getElementById('record').addEventListener('click', toggleRecord);
    document.getElementById('play').addEventListener('click', togglePlayState);
    document.getElementById('pause').addEventListener('click', togglePlayState);

    document.getElementById('track-container').addEventListener('mousedown', clickTrackHandler);

    document.body.addEventListener('keydown', keydown);
    var n = < any > navigator;
    n.getUserMedia = n.getUserMedia || n.mozGetUserMedia || n.webkitGetUserMedia;
    n.getUserMedia({
            audio: true
        },
        success,
        function(err) {
            console.log("The following error occured: " + err);
        }
    );
}

function toggleRecord() {
    if (state === State.Recording) {
        state = State.Stopped;
        ( < HTMLImageElement > document.getElementById('record')).src = 'images/record.png';
        currentTrack.stopRecording();

        nodes.streamSource.disconnect(nodes.scriptProcessor);
        nodes.scriptProcessor.disconnect(context.destination);
    } else {
        state = State.Recording;
        ( < HTMLImageElement > document.getElementById('record')).src = 'images/stop.png';
        currentTrack = new AudioEditorTrack();
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
    switch (e.keyCode) {
        case 32: //Space
            togglePlayState();
            break;
        case 8: //Backspace
            currentTrack.deleteSelection();
            e.preventDefault();
            break;
        default:
            console.log(e.keyCode);

    }
}

function togglePlayState() {
    if (state === State.Stopped) {
        play();
    } else if (state === State.Playing) {
        stop();
    }
}

function stop() {
    state = State.Stopped;
    tracks.forEach(function(track) {
        track.stop();
    });
}

function play() {
    state = State.Playing;
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
        if (state === State.Recording) {
            currentTrack.addBufferSegment(e.inputBuffer);
        }
    };
}

function clickTrackHandler(e) {
    tracks.forEach(function(track) {
        track.setScrubberPosition(e.clientX);
    });
}

function mousedownCanvasHandler(e) {
    console.log("mouse down");
    this.track.startHighlight(e.clientX);
    currentTrack = this.track;
    this.addEventListener("mouseup", mouseupCanvasHandler);
    this.addEventListener("mousemove", mousemoveCanvasHandler);
}

function mouseupCanvasHandler(e) {
    console.log("mouse up");
    this.removeEventListener("mouseup", mouseupCanvasHandler);
    this.removeEventListener("mousemove", mousemoveCanvasHandler);
}

function mousemoveCanvasHandler(e) {
    this.track.updateHighlight(e.clientX);
    console.log("mouse move!!: " + e);
}

