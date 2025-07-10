# 🎙️ Voice Chat AI

A real-time voice chat application built with Fresh framework and OpenAI's Realtime Voice API.

## Features

- **Real-time Voice Chat**: Talk with AI using your voice
- **Modern UI**: Clean, responsive design with Tailwind CSS
- **WebRTC Audio**: High-quality voice capture and playback
- **OpenAI Integration**: Powered by OpenAI's Realtime Voice API
- **No Build Step**: Instant development with Fresh framework

## Prerequisites

- [Deno](https://deno.land/manual/getting_started/installation) 1.45.2 or later
- OpenAI API key with access to the Realtime Voice API

## Setup

1. **Clone and install dependencies**:
   ```bash
   # Dependencies are automatically managed by Deno
   ```

2. **Set up environment variables**:
   ```bash
   # Create a .env file in the root directory
   echo "OPENAI_API_KEY=your_openai_api_key_here" > .env
   ```

3. **Get your OpenAI API key**:
   - Go to [OpenAI Platform](https://platform.openai.com/api-keys)
   - Create a new API key
   - Make sure you have access to the Realtime Voice API

## Development

Start the development server:

```bash
deno task start
```

This will start the server at `http://localhost:8000` with hot reloading enabled.

## Usage

1. Open your browser and navigate to `http://localhost:8000`
2. Click the microphone button to start a voice chat
3. Allow microphone permissions when prompted
4. Start talking to the AI assistant!

## Deployment

Deploy to Deno Deploy:

1. Push your code to a GitHub repository
2. Create a new project on [Deno Deploy](https://dash.deno.com)
3. Connect your GitHub repository
4. Set the `OPENAI_API_KEY` environment variable in your project settings
5. Deploy!

## Project Structure

```
├── islands/
│   └── VoiceChat.tsx      # Voice chat component (client-side)
├── routes/
│   ├── api/
│   │   └── voice.ts       # Voice API endpoint
│   └── index.tsx          # Main page
├── static/                # Static assets
├── deno.json             # Deno configuration
└── main.ts               # Application entry point
```

## Technology Stack

- **Frontend**: Fresh framework with Preact
- **Backend**: Deno runtime
- **Voice AI**: OpenAI Realtime Voice API
- **Styling**: Tailwind CSS
- **Audio**: WebRTC MediaRecorder API
- **Deployment**: Deno Deploy

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use this project for your own applications!

# fresh project

### Usage

Make sure to install Deno: https://deno.land/manual/getting_started/installation

Then start the project:

```
deno task start
```

This will watch the project directory and restart as necessary.

## Realtime Voice Chat

This project now includes a realtime voice chat feature powered by OpenAI's Realtime API. Here's how to use it:

### Setup

1. **Get an OpenAI API Key**: You'll need an OpenAI API key with access to the Realtime API.

2. **Set Environment Variable**: 
   ```bash
   export OPENAI_API_KEY=your-api-key-here
   ```

3. **Start the Server**: 
   ```bash
   deno task start
   ```

4. **Open in Browser**: Navigate to `http://localhost:8000`

### How It Works

- **Click the 🎙️ button** to start a voice session
- **Allow microphone access** when prompted
- **Start speaking** - the AI will respond in real-time
- **Click the 🔴 button** to stop the session

### Features

- **True realtime conversation** - No waiting for speech-to-text processing
- **Voice activity detection** - Automatically detects when you start and stop speaking
- **Real-time audio playback** - Hear the AI's response as it's generated
- **WebSocket connection** - Direct connection to OpenAI's Realtime API
- **Audio processing** - Automatic echo cancellation and noise suppression

### Technical Details

The implementation uses:
- **WebSocket connection** to OpenAI's Realtime API
- **MediaRecorder API** for capturing audio
- **Real-time audio streaming** in base64 format
- **Server-side Voice Activity Detection (VAD)** for natural conversations

No additional dependencies required - everything works directly in the browser!
