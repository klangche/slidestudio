// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

// Add to Home Screen prompt
let deferredPrompt;
const installButton = document.createElement('button');
installButton.innerHTML = '📱 Install App';
installButton.className = 'ss-install-button';

installButton.addEventListener('click', async () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            installButton.style.display = 'none';
        }
        deferredPrompt = null;
    }
});

document.body.appendChild(installButton);

window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    installButton.style.display = 'block';
});
