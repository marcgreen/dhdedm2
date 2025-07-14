import { Head } from "$fresh/runtime.ts";

export default function Offline() {
  return (
    <>
      <Head>
        <title>Offline - Der Spielleiter</title>
        <meta name="robots" content="noindex" />
      </Head>
      
      <div class="min-h-screen bg-gradient-to-br from-purple-900 to-blue-900 text-white">
        <div class="container mx-auto px-4 py-8">
          <div class="max-w-4xl mx-auto text-center">
            {/* Offline Header */}
            <div class="mb-8">
              <div class="text-6xl mb-4">🏰</div>
              <h1 class="text-4xl font-bold mb-4 text-purple-200">
                Du bist offline
              </h1>
              <p class="text-xl text-gray-300 mb-6">
                Der Spielleiter benötigt eine Internetverbindung für die Sprach-Features.
              </p>
            </div>

            {/* Available Offline Features */}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
                <h2 class="text-xl font-bold mb-4 flex items-center justify-center">
                  📖 Verfügbare Features
                </h2>
                <ul class="text-left space-y-2 text-gray-300">
                  <li class="flex items-center">
                    <span class="text-green-400 mr-2">✓</span>
                    Gespeicherte Unterhaltungen anzeigen
                  </li>
                  <li class="flex items-center">
                    <span class="text-green-400 mr-2">✓</span>
                    Charakterbogen betrachten
                  </li>
                  <li class="flex items-center">
                    <span class="text-green-400 mr-2">✓</span>
                    Gelerntes Vokabular durchgehen
                  </li>
                  <li class="flex items-center">
                    <span class="text-green-400 mr-2">✓</span>
                    Spielregeln nachlesen
                  </li>
                </ul>
              </div>

              <div class="bg-slate-800 p-6 rounded-xl shadow-xl">
                <h2 class="text-xl font-bold mb-4 flex items-center justify-center">
                  🔒 Benötigt Internet
                </h2>
                <ul class="text-left space-y-2 text-gray-300">
                  <li class="flex items-center">
                    <span class="text-red-400 mr-2">✗</span>
                    Sprach-Chat mit der KI
                  </li>
                  <li class="flex items-center">
                    <span class="text-red-400 mr-2">✗</span>
                    Neue Unterhaltungen starten
                  </li>
                  <li class="flex items-center">
                    <span class="text-red-400 mr-2">✗</span>
                    Charakterdaten aktualisieren
                  </li>
                  <li class="flex items-center">
                    <span class="text-red-400 mr-2">✗</span>
                    Neue Spiele erstellen
                  </li>
                </ul>
              </div>
            </div>

            {/* Cached Data Access */}
            <div class="bg-slate-800 p-6 rounded-xl shadow-xl mb-8">
              <h2 class="text-xl font-bold mb-4">💾 Zwischengespeicherte Daten</h2>
              <p class="text-gray-300 mb-4">
                Deine letzten Spieldaten sind verfügbar, auch wenn du offline bist.
              </p>
              
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                 <button 
                   class="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg transition-colors"
                   onClick={() => showCachedData('character')}
                 >
                   📋 Charakterbogen
                 </button>
                 <button 
                   class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
                   onClick={() => showCachedData('conversations')}
                 >
                   💬 Unterhaltungen
                 </button>
                 <button 
                   class="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors"
                   onClick={() => showCachedData('vocabulary')}
                 >
                   📚 Vokabular
                 </button>
              </div>
            </div>

            {/* Retry Connection */}
            <div class="text-center">
              <button 
                onclick="checkConnection()"
                class="bg-green-600 hover:bg-green-700 px-8 py-3 rounded-lg text-lg font-semibold transition-colors"
              >
                🔄 Verbindung prüfen
              </button>
              <p class="text-sm text-gray-400 mt-2">
                Klicke hier, um zu prüfen, ob eine Internetverbindung verfügbar ist.
              </p>
            </div>

            {/* Cached Data Display */}
            <div id="cached-data-display" class="mt-8 hidden">
              <div class="bg-slate-700 p-6 rounded-xl">
                <div class="flex justify-between items-center mb-4">
                  <h3 id="cached-data-title" class="text-lg font-bold"></h3>
                  <button 
                    onclick="hideCachedData()"
                    class="text-gray-400 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div id="cached-data-content" class="text-left"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* JavaScript for offline functionality */}
      <script dangerouslySetInnerHTML={{
        __html: `
          function checkConnection() {
            if (navigator.onLine) {
              window.location.href = '/';
            } else {
              alert('Noch keine Internetverbindung verfügbar. Versuche es später erneut.');
            }
          }

          function showCachedData(type) {
            const display = document.getElementById('cached-data-display');
            const title = document.getElementById('cached-data-title');
            const content = document.getElementById('cached-data-content');
            
            display.classList.remove('hidden');
            
            switch(type) {
              case 'character':
                title.textContent = '📋 Charakterbogen';
                content.innerHTML = getCachedCharacterData();
                break;
              case 'conversations':
                title.textContent = '💬 Letzte Unterhaltungen';
                content.innerHTML = getCachedConversations();
                break;
              case 'vocabulary':
                title.textContent = '📚 Gelerntes Vokabular';
                content.innerHTML = getCachedVocabulary();
                break;
            }
          }

          function hideCachedData() {
            document.getElementById('cached-data-display').classList.add('hidden');
          }

          function getCachedCharacterData() {
            // Try to get cached character data from localStorage
            const gameState = localStorage.getItem('gameState');
            if (gameState) {
              try {
                const data = JSON.parse(gameState);
                const player = data.player || {};
                return \`
                  <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                      <span>Name:</span>
                      <span class="text-purple-300">\${player.name || 'Unbekannt'}</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Klasse:</span>
                      <span class="text-blue-300">\${player.class || 'Nicht festgelegt'}</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Stufe:</span>
                      <span class="text-yellow-300">\${player.level || 1}</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Lebenspunkte:</span>
                      <span class="text-red-300">\${player.hp?.current || 0}/\${player.hp?.max || 0}</span>
                    </div>
                    <div class="flex justify-between">
                      <span>Ort:</span>
                      <span class="text-green-300">\${player.currentLocation || 'Unbekannt'}</span>
                    </div>
                  </div>
                \`;
              } catch (e) {
                return '<p class="text-gray-400">Fehler beim Laden der Charakterdaten.</p>';
              }
            }
            return '<p class="text-gray-400">Keine gespeicherten Charakterdaten gefunden.</p>';
          }

          function getCachedConversations() {
            // Try to get cached conversation data from localStorage
            const conversations = localStorage.getItem('conversationHistory');
            if (conversations) {
              try {
                const data = JSON.parse(conversations);
                if (data.length === 0) {
                  return '<p class="text-gray-400">Keine gespeicherten Unterhaltungen gefunden.</p>';
                }
                
                return data.slice(-5).map(msg => \`
                  <div class="mb-3 p-3 rounded \${msg.role === 'user' ? 'bg-blue-900' : 'bg-purple-900'}">
                    <div class="flex justify-between items-center mb-1">
                      <span class="text-xs font-semibold \${msg.role === 'user' ? 'text-blue-300' : 'text-purple-300'}">
                        \${msg.role === 'user' ? 'Du' : 'Der Spielleiter'}
                      </span>
                      <span class="text-xs text-gray-400">\${msg.timestamp}</span>
                    </div>
                    <div class="text-sm">\${msg.content}</div>
                  </div>
                \`).join('');
              } catch (e) {
                return '<p class="text-gray-400">Fehler beim Laden der Unterhaltungen.</p>';
              }
            }
            return '<p class="text-gray-400">Keine gespeicherten Unterhaltungen gefunden.</p>';
          }

          function getCachedVocabulary() {
            // Try to get cached vocabulary from localStorage
            const gameState = localStorage.getItem('gameState');
            if (gameState) {
              try {
                const data = JSON.parse(gameState);
                const vocabulary = data.vocabularyIntroduced || [];
                if (vocabulary.length === 0) {
                  return '<p class="text-gray-400">Noch kein Vokabular gelernt.</p>';
                }
                
                return \`
                  <div class="text-sm">
                    <p class="mb-3 text-gray-300">Gelernte Wörter (\${vocabulary.length}):</p>
                    <div class="flex flex-wrap gap-2">
                      \${vocabulary.slice(-20).map(word => \`
                        <span class="bg-green-800 px-2 py-1 rounded text-xs">\${word}</span>
                      \`).join('')}
                    </div>
                  </div>
                \`;
              } catch (e) {
                return '<p class="text-gray-400">Fehler beim Laden des Vokabulars.</p>';
              }
            }
            return '<p class="text-gray-400">Keine Vokabulardaten gefunden.</p>';
          }

          // Auto-check connection periodically
          setInterval(() => {
            if (navigator.onLine) {
              // Show reconnection notice
              const notice = document.createElement('div');
              notice.className = 'fixed top-4 right-4 bg-green-600 text-white p-4 rounded-lg shadow-lg z-50';
              notice.innerHTML = \`
                <div class="flex items-center">
                  <span class="mr-2">🌐</span>
                  <span>Verbindung wiederhergestellt!</span>
                  <button onclick="this.parentNode.parentNode.remove(); window.location.href='/';" class="ml-3 bg-white text-green-600 px-2 py-1 rounded text-sm">
                    Zurück zur App
                  </button>
                </div>
              \`;
              document.body.appendChild(notice);
            }
          }, 5000);
        `
      }} />
    </>
  );
} 