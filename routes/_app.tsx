import { type PageProps } from "$fresh/server.ts";

export default function App({ Component }: PageProps) {
  return (
    <html lang="de">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        
        {/* App Information */}
        <title>Der Spielleiter - Deutsches D&D</title>
        <meta name="description" content="German Learning through D&D - Voice-powered role-playing game" />
        <meta name="author" content="Der Spielleiter Team" />
        
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        
        {/* iOS Safari */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Der Spielleiter" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-startup-image" href="/icons/icon-512x512.png" />
        
        {/* Theme Colors */}
        <meta name="theme-color" content="#7c3aed" />
        <meta name="msapplication-TileColor" content="#7c3aed" />
        <meta name="msapplication-config" content="/browserconfig.xml" />
        
        {/* Favicon */}
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16x16.png" />
        
        {/* Stylesheets */}
        <link rel="stylesheet" href="/styles.css" />
        
        {/* Service Worker Registration */}
        <script dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              let swRegistration = null;
              let isOnline = navigator.onLine;
              let deferredPrompt = null;
              
              // Register service worker
              navigator.serviceWorker.register('/sw.js')
                .then((registration) => {
                  console.log('[PWA] Service Worker registered:', registration);
                  swRegistration = registration;
                  
                  // Check for updates
                  registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                      newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                          // New content available, show update notification
                          showUpdateNotification();
                        }
                      });
                    }
                  });
                })
                .catch((error) => {
                  console.error('[PWA] Service Worker registration failed:', error);
                });
              
              // Handle offline/online status
              function updateOnlineStatus() {
                const wasOnline = isOnline;
                isOnline = navigator.onLine;
                
                if (!wasOnline && isOnline) {
                  // Back online
                  console.log('[PWA] Back online');
                  hideOfflineNotification();
                } else if (wasOnline && !isOnline) {
                  // Gone offline
                  console.log('[PWA] Gone offline');
                  showOfflineNotification();
                }
              }
              
              window.addEventListener('online', updateOnlineStatus);
              window.addEventListener('offline', updateOnlineStatus);
              
              // Install prompt handling
              window.addEventListener('beforeinstallprompt', (e) => {
                console.log('[PWA] Install prompt available');
                e.preventDefault();
                deferredPrompt = e;
                showInstallButton();
              });
              
              // Show install button
              function showInstallButton() {
                // This could be integrated into the VoiceChat component
                const installBtn = document.createElement('button');
                installBtn.textContent = '📱 App installieren';
                installBtn.className = 'fixed bottom-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-purple-700 transition-colors z-50';
                installBtn.onclick = installApp;
                document.body.appendChild(installBtn);
              }
              
              // Install app
              function installApp() {
                if (deferredPrompt) {
                  deferredPrompt.prompt();
                  deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                      console.log('[PWA] User accepted install prompt');
                    }
                    deferredPrompt = null;
                    // Remove install button
                    const installBtn = document.querySelector('button[onclick="installApp()"]');
                    if (installBtn) installBtn.remove();
                  });
                }
              }
              
              // Show update notification
              function showUpdateNotification() {
                const notification = document.createElement('div');
                notification.className = 'fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm';
                notification.innerHTML = \`
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-semibold">Update verfügbar!</p>
                      <p class="text-sm">Neue Features sind bereit.</p>
                    </div>
                    <button onclick="updateApp()" class="ml-4 bg-white text-blue-600 px-3 py-1 rounded text-sm hover:bg-gray-100">
                      Aktualisieren
                    </button>
                  </div>
                \`;
                document.body.appendChild(notification);
                
                // Auto-remove after 10 seconds
                setTimeout(() => {
                  if (notification.parentNode) {
                    notification.remove();
                  }
                }, 10000);
              }
              
              // Update app
              function updateApp() {
                if (swRegistration && swRegistration.waiting) {
                  swRegistration.waiting.postMessage({ action: 'skipWaiting' });
                  window.location.reload();
                }
              }
              
              // Show offline notification
              function showOfflineNotification() {
                const notification = document.createElement('div');
                notification.id = 'offline-notification';
                notification.className = 'fixed top-4 left-4 bg-yellow-600 text-white p-3 rounded-lg shadow-lg z-50';
                notification.innerHTML = \`
                  <div class="flex items-center">
                    <span class="mr-2">📡</span>
                    <span>Offline - Eingeschränkte Funktionalität</span>
                  </div>
                \`;
                document.body.appendChild(notification);
              }
              
              // Hide offline notification
              function hideOfflineNotification() {
                const notification = document.getElementById('offline-notification');
                if (notification) {
                  notification.remove();
                }
              }
              
              // Make functions globally available
              window.installApp = installApp;
              window.updateApp = updateApp;
            }
          `
        }} />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
}
