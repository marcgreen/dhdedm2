# Fresh Project - OpenAI Realtime Voice Chat

### Usage

Make sure to install Deno: https://deno.land/manual/getting_started/installation

Then start the project:

```
deno task start
```

This will watch the project directory and restart as necessary.

## OpenAI Agents SDK Realtime Voice Chat

This project implements a **secure realtime voice chat** using the OpenAI Agents SDK following the exact quickstart guide pattern with **ephemeral client tokens**.

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

### Secure Implementation

Following the **exact OpenAI Agents SDK security pattern**:

**Server (generates ephemeral token):**
```bash
curl -X POST https://api.openai.com/v1/realtime/sessions \
   -H "Authorization: Bearer $OPENAI_API_KEY" \
   -H "Content-Type: application/json" \
   -d '{"model": "gpt-4o-realtime-preview-2025-06-03"}'
```

**Client (uses ephemeral token):**
```typescript
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';

const agent = new RealtimeAgent({
  name: 'Assistant',
  instructions: 'You are a helpful voice assistant...',
});

const session = new RealtimeSession(agent, {
  model: 'gpt-4o-realtime-preview-2025-06-03',
});

// Connect using ephemeral client token (secure for browser)
await session.connect({
  apiKey: '<ephemeral-client-token>',
});
```

### Features

- **✅ Secure ephemeral tokens** - Main API key never sent to browser
- **✅ True realtime conversation** - No speech-to-text delays
- **✅ Automatic WebRTC handling** - SDK manages all audio connections
- **✅ Voice activity detection** - Built-in conversation flow
- **✅ Simple implementation** - Following official docs exactly!

### Security Flow

```
1. Browser → Server: Request session
2. Server → OpenAI: Generate ephemeral token (with main API key)
3. Server → Browser: Return ephemeral token
4. Browser → OpenAI: Connect with ephemeral token (secure)
```

### Technical Details

The OpenAI Agents SDK handles:
- **WebRTC connection** to your microphone and speakers
- **Real-time audio streaming** to OpenAI's servers
- **Voice activity detection** for natural conversation flow
- **Audio processing** and playback
- **All WebSocket protocol details** automatically

**Zero manual audio processing required!** The SDK does all the heavy lifting.

### Production Ready

This implementation is **production ready** because:
- ✅ Main API key stays secure on server
- ✅ Ephemeral tokens are temporary and browser-safe
- ✅ No sensitive credentials exposed to client
- ✅ Following official OpenAI security recommendations
