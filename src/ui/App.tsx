import { useEffect, useState, useRef } from 'react';
import './App.css';

// This URL points to our Worker script for background operations
const workerUrl = new URL('./worker.ts', import.meta.url).href;

// Extend the HTMLAudioElement interface to allow sink ID switching
declare global {
  interface HTMLAudioElement {
    setSinkId?(sinkId: string): Promise<void>;
  }
}

function App() {
  // A list of recognized transcripts
  const [transcriptions, setTranscriptions] = useState<string[]>([]);
  // Whether the recorder is currently listening
  const [isListening, setIsListening] = useState(false);
  // A status message displayed to the user
  const [status, setStatus] = useState('');

  // Worker and other refs for controlling audio recording/processing
  const workerRef = useRef<Worker | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunkQueueRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speakingRef = useRef<boolean>(false);
  const silenceStartRef = useRef<number | undefined>(undefined);
  const outputAudioRef = useRef<HTMLAudioElement | null>(null);
  const cableDeviceIdRef = useRef<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackQueueRef = useRef<Blob[]>([]);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    // Create a new Web Worker for background audio processing
    const worker = new Worker(workerUrl);
    workerRef.current = worker;

    // Listen for messages from the Worker
    worker.onmessage = (event) => {
      const { status, message, error, result } = event.data;

      // Display the status or message from the worker
      setStatus(message);

      if (status === 'error') {
        // Log any error coming from the worker
        console.error('Worker error:', error);
      } 
      else if (status === 'done') {
        // Append the recognized text to the transcriptions list
        setTranscriptions(prev => [result.transcribeText, ...prev]);

        // Push the new audio blob into our playback queue
        playbackQueueRef.current.push(result.blob);

        // If nothing is playing currently, start playback
        if (!isPlayingRef.current) {
          playNextInQueue();
        }
      }
    };

    // Ask the worker to initialize itself (e.g., load any models)
    worker.postMessage({ type: 'start' });

    // Set up the microphone and begin recording
    setupMicrophone();

    return () => {
      // Cleanup when the component is unmounted
      setIsListening(false);

      // Stop the recorder if still running
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }

      // Close the AudioContext if available
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      // Clear audio element source
      if (outputAudioRef.current) {
        outputAudioRef.current.srcObject = null;
      }

      // Terminate the worker
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  async function setupMicrophone() {
    // Clear any old chunks
    chunkQueueRef.current = [];

    try {
      setIsListening(true);
      setStatus('Setting up microphone...');

      // Acquire access to the microphone
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      micStreamRef.current = micStream;

      // Create a MediaRecorder for capturing the microphone audio
      const recorder = new MediaRecorder(micStream, {
        mimeType: 'audio/webm'
      });
      recorderRef.current = recorder;

      // When data is available, push chunks into our queue
      recorder.ondataavailable = ev => {
        chunkQueueRef.current.push(ev.data);
      };

      // When the recorder stops, stop all mic tracks
      recorder.onstop = () => {
        console.log('MediaRecorder stopped');
        micStream.getTracks().forEach(track => track.stop());
      };

      // Create an AudioContext for analyzing or routing the audio
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      // Source node for the microphone stream
      const src = audioContext.createMediaStreamSource(micStream);
      sourceNodeRef.current = src;

      // A ScriptProcessor node to detect silence or speech
      const proc = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = proc;

      // Connect the script processor to the source
      src.connect(proc);
      proc.connect(audioContext.destination);

      const destination = audioContext.createMediaStreamDestination();
      src.connect(destination);

      // Set up the virtual output device (e.g., CABLE Input)
      await setupOutputDevice();

      // Threshold to determine "silence" vs "speech"
      const silenceThreshold = 0.06;

      // Detect if user stops speaking for ~700ms
      proc.onaudioprocess = ev => {
        const buf = ev.inputBuffer.getChannelData(0);
        let sumSq = 0;
        for (const x of buf) sumSq += x * x;
        const rms = Math.sqrt(sumSq / buf.length);

        if (rms > silenceThreshold) {
          // The user is speaking
          silenceStartRef.current = undefined;
          speakingRef.current = true;
        } else if (speakingRef.current) {
          if (silenceStartRef.current === undefined) {
            silenceStartRef.current = performance.now();
          }
          if (performance.now() - silenceStartRef.current > 700) {
            // The user finished speaking; process the sentence
            speakingRef.current = false;
            processSentence(recorder);
          }
        }
      };

      // Start recording every 200 ms
      recorder.start(200);
      setStatus('🎤 Dinliyor....');

    } catch (error) {
      console.error('Microphone setup error:', error);
      if (error instanceof Error) {
        setStatus(`Microphone error: ${error.message}`);
      } else {
        setStatus('Microphone error: Unknown error');
      }
      setIsListening(false);
    }
  }

  function cleanupMic() {
    // Stop and clear the recorder
    if (recorderRef.current) {
      if (recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
      recorderRef.current = null;
    }
    // Disconnect and clear the audio processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    // Disconnect and clear the source node
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    // Close and nullify the AudioContext
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    // Stop the mic Stream tracks
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
  }

  async function setupOutputDevice() {
    // Enumerate devices to find "CABLE Input"
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cableInput = devices.find(d =>
        d.kind === 'audiooutput' &&
        d.label.includes('CABLE Input')
      );

      if (!cableInput) {
        console.warn('⚠️ CABLE Input not found');
        return;
      }

      // Save the device ID for routing audio
      cableDeviceIdRef.current = cableInput.deviceId;

      console.log('🔊 Virtual mic started');
        } catch (error) {
      console.error('Output device error:', error);
    }
  }

  async function processSentence(recorder: MediaRecorder) {
    // If no audio chunks, do nothing
    if (chunkQueueRef.current.length === 0) return;

    // Stop the active recorder session, then clean up
    if (recorderRef.current) {
      const currentState = recorderRef.current.state;
      if (currentState !== 'inactive') {
        recorder.stop();
      }
      cleanupMic();
    }

    try {
      // Combine all chunks into one Blob
      const sentenceBlob = new Blob(chunkQueueRef.current, {
        type: 'audio/webm'
      });

      setStatus(`🔄 Processing ${Math.round(sentenceBlob.size / 1024)} KB audio...`);

      // Convert the blob to an ArrayBuffer
      const audioBuffer = await sentenceBlob.arrayBuffer();
      const mimeType = 'audio/webm';

      // Send to Worker for transcription
      if (workerRef.current) {
        workerRef.current.postMessage({
          type: 'transcribe',
          data: {
            audio: audioBuffer,
            mimeType
          }
        });
      }
    } catch (error) {
      console.error('Processing error:', error);
      setStatus(
        `Processing error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    } finally {
      // After processing, re-setup the mic for the next recording
      await setupMicrophone();
    }
  }

  async function playNextInQueue() {
    // Retrieve the next blob from the playback queue
    const blob = playbackQueueRef.current.shift();
    if (!blob) {
      isPlayingRef.current = false;
      return;
    }
    isPlayingRef.current = true;

    // Create a URL for the blob
    const url = URL.createObjectURL(blob);
    const audioEl = new Audio(url);

    // If setSinkId is supported and we have the cable ID, route audio
    if (typeof audioEl.setSinkId === 'function' && cableDeviceIdRef.current) {
      audioEl
        .setSinkId(cableDeviceIdRef.current)
        .then(() => audioEl.play())
        .catch(err => {
          console.error('setSinkId error:', err);
          playNextInQueue(); // Try the next item if there's an error
        })
        .finally(() => {
          // Clean up URL and move on
          URL.revokeObjectURL(url);
          playNextInQueue();
        });
    } else {
      // If we can't set the sink device, just skip to the next
      playNextInQueue();
    }
  }

  return (
    <div className="container">
      <div className="status">
        {/* Show whether we’re listening or paused */}
        <span className={isListening ? 'listening' : 'not-listening'}>
            {status || (isListening ? '🎙️ Listening...' : '⏸️ Not listening')}
        </span>
      </div>

      <div className="transcript-container">
        <div className="transcript-box">
          {/* Render a list of transcribed sentences */}
          {transcriptions.map((text, i) => (
            <p key={`tr-${i}`}>{text}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;