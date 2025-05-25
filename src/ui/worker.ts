// Error: import statement was invalidly placed. We wrap everything in an async IIFE.

(async () => {
  // Dynamically import the OpenAI client inside a worker context
  const { OpenAI } = await import('openai');

  // Create an instance of the OpenAI client (example API key shown here, replace with your own)
  const openai = new OpenAI({
    apiKey: 'openai_api_key_here'
  });

  // Listen for messages from the main thread
  self.onmessage = async (event) => {
    const { type, data } = event.data;

    if (type === 'start') {
      // Inform that the worker is ready
      postMessage({ status: 'ready', message: 'Worker is ready' });

    } else if (type === 'transcribe') {
      console.log(
        '🛰️ Worker got transcribe request:',
        'mimeType=', data.mimeType,
        'audio byteLength=', data.audio.byteLength
      );

      try {
        // Notify the main thread that transcription is in progress
        postMessage({ status: 'transcribing', message: 'Transcription in progress...' });

        // Create a File object from the audio data
        const file = new File([data.audio], "audio.webm", { type: data.mimeType });

        // Call the OpenAI API to transcribe using Whisper
        const res = await openai.audio.translations.create({
          file: file,
          model: 'whisper-1',
          response_format: 'text'
        });

        console.log('Transcription response:', res);

        if (res) {
          // Perform TTS using the recognized text
          const mp3 = await openai.audio.speech.create({
            model: "tts-1-hd",
            voice: "alloy",
            input: typeof res === 'string' ? res : (res.text ?? '')
          });

          console.log('TTS done');

          // Return the audio blob plus the recognized text back to the main thread
          postMessage({
            status: 'done',
            message: 'Process completed',
            result: {
              blob: await mp3.blob(),
              mimeType: "audio/mp3",
              transcribeText: res
            }
          });
        } else {
          // If the transcription result is empty
          postMessage({ status: 'error', message: 'Transcribe error' });
        }

      } catch (err) {
        let errorMessage = 'Unknown error';
        if (err instanceof Error) {
          errorMessage = err.message;
        } else if (typeof err === 'string') {
          errorMessage = err;
        }
        postMessage({
          status: 'error',
          message: 'Transcribe error',
          error: errorMessage
        });
      }
    }
  };
})();