# Meeting Translator (Electron + Vite + React + TypeScript)

This project is an Electron application built with Vite, React, and TypeScript. It aims to provide near real-time translation of livestreamed audio and output the translated audio to a virtual microphone such as [VB-CABLE](https://vb-audio.com/Cable/) so it can be used on various conferencing platforms (Zoom, Teams, Discord, etc.).

## Prerequisites

1. **Install VB-CABLE (or equivalent virtual audio driver).**  
   This is necessary to route your translated speech as if it were coming from a regular microphone.  
2. **Obtain an OpenAI API key** that supports the following models:  
   - `whisper-1` (for transcribing and optionally translating audio)  
   - `tts-1-hd` (for text-to-speech)  

   Notes:  
   - The `whisper-1` model can transcribe and translate, but the translation part can be unstable.  
   - Instead of `tts-1-hd`, you can use `tts-1` or `gpt-4o-mini-tts` (though the voice and quality may differ).

## Key Features & Workflow

1. **Real-Time Translation with Virtual Microphone**  
   - The main goal is to transcribe the user’s speech in real time, convert the text back to audio (TTS), and output that audio to a virtual mic driver like VB-CABLE.

2. **Silence Detection & Sentence Parsing**  
   - The application monitors audio levels for a period of silence (e.g., 700 ms) to determine the end of a sentence.  
   - This helps break continuous speech into sentence-level chunks.  
   - Each chunk is then sent to the OpenAI API, reducing the number of API calls and lowering costs.

3. **OpenAI Models**  
   - Uses `whisper-1` for transcription (and limited translation).  
   - Uses `tts-1-hd` for text-to-speech. Other alternatives can be plugged in (e.g., `tts-1`, `gpt-4o-mini-tts`, etc.).

4. **API Usage & Translation Options**  
   - Only English translation is currently targeted, because `whisper-1`’s built-in translation is limited to English.  
   - For more stable or multilingual translations, one could send the transcribed text to a different translation service/API instead of relying on `whisper-1`’s built-in translation.

## Project Setup

1. **Installation**  
   Clone or download the repository, then install dependencies:
   ```bash
   npm install
   npm run dev
   ```
   or
   ```bash
   yarn
   yarn dev
   ```
   This will start the development server with hot-module reloading. Your Electron window should open automatically.

2. **Configuration**  
   - Provide your OpenAI API key (with rights to use whisper and TTS models).  
   - VB-CABLE or a similar virtual audio driver must be installed and configured on your system before launching the application.

## Current Limitations & Areas for Improvement

1. **Buffer Queue Issues**  
   - When a very long sentence is followed by a short utterance, the buffer queue can get desynchronized. This logic might need refinement or a more robust queueing system.

2. **UI Model Selection**  
   - Currently, the TTS model is hard-coded. The UI could allow selecting different TTS engines (e.g. `tts-1-hd`, `tts-1`, `gpt-4o-mini-tts`, etc.).

3. **Language Support**  
   - Since the `whisper-1` model only reliably targets English when doing translation, adding a separate translation API or additional multilingual models would enable more diverse language output.

## Contributing

Feel free to open issues or create pull requests for improvements. Whether you want to add new features, fix bugs, or suggest new approaches for real-time translation, your contributions are welcome!

---

© 2025 Meeting Translator. Licensed under MIT or see repository for details.
