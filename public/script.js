let currentShareUrl = '';
let currentImageFile = null;

// Handle Paste Events
document.addEventListener('paste', (e) => {
    // Only intercept if we are on the 'create' tab
    if (!document.getElementById('create-tab').classList.contains('active')) return;

    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            e.preventDefault(); // Stop default paste into textarea
            const file = item.getAsFile();
            loadImage(file);
            break;
        }
    }
});

function loadImage(file) {
    currentImageFile = file;
    const reader = new FileReader();
    reader.onload = function(event) {
        document.getElementById('image-preview').src = event.target.result;
        document.getElementById('image-preview-container').classList.remove('hidden');
        document.getElementById('create-input').classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

function clearImage() {
    currentImageFile = null;
    document.getElementById('image-preview-container').classList.add('hidden');
    document.getElementById('create-input').classList.remove('hidden');
    document.getElementById('create-input').value = '';
}

// Check URL query params on page load for a direct link (e.g., ?c=ABCD)
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('c');
    if (code && code.length === 4) {
        showTab('retrieve');
        document.getElementById('retrieve-input').value = code.toUpperCase();
        retrieveClipboard(); // auto-fetch
        // Clean URL after auto-fetching
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

function showTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const activePanel = document.getElementById(`${tabId}-tab`);
    activePanel.classList.remove('hidden');
    activePanel.classList.add('active');
    
    document.getElementById(`tab-${tabId}`).classList.add('active');
}

async function createClipboard() {
    const formData = new FormData();
    
    if (currentImageFile) {
        formData.append('type', 'image');
        formData.append('image', currentImageFile);
    } else {
        const content = document.getElementById('create-input').value.trim();
        if (!content) return showToast('ERR: NO DATA DETECTED');
        formData.append('type', 'text');
        formData.append('content', content);
    }

    try {
        const res = await fetch('/api/clipboard', {
            method: 'POST',
            body: formData // fetch automatically sets multipart/form-data with boundaries
        });
        const data = await res.json();
        
        if (!res.ok) throw new Error(data.error || 'UPLOAD FAILED');

        document.getElementById('result-code').textContent = data.code;
        currentShareUrl = `${window.location.origin}/?c=${data.code}`;
        
        const qrRes = await fetch(`/api/qrcode?text=${encodeURIComponent(currentShareUrl)}`);
        const qrData = await qrRes.json();
        if(qrData.dataUrl) {
            document.getElementById('qrcode').src = qrData.dataUrl;
        }

        document.getElementById('create-result').classList.remove('hidden');
        showToast('DATA UPLOADED TO MAINFRAME');
        
        // Reset the form after success
        if (currentImageFile) {
             clearImage();
        } else {
             document.getElementById('create-input').value = '';
        }
    } catch (err) {
        showToast(err.message);
    }
}

async function retrieveClipboard() {
    const code = document.getElementById('retrieve-input').value.trim().toUpperCase();
    if (!code || code.length !== 4) return showToast('ERR: INVALID KEY');

    try {
        const res = await fetch(`/api/clipboard/${code}`);
        const data = await res.json();

        if (!res.ok) {
            document.getElementById('retrieve-result').classList.add('hidden');
            throw new Error(data.error || 'DATA NOT FOUND / PURGED');
        }

        // Handle text vs image display
        if (data.type === 'image') {
            document.getElementById('result-text-container').classList.add('hidden');
            document.getElementById('text-actions').classList.add('hidden');
            
            const imgEl = document.getElementById('result-image');
            imgEl.src = data.content; // The path (e.g. /uploads/xxx.png)
            
            const downloadLink = document.getElementById('download-link');
            downloadLink.href = data.content;
            
            document.getElementById('result-image-container').classList.remove('hidden');
            document.getElementById('image-actions').classList.remove('hidden');
        } else {
            document.getElementById('result-image-container').classList.add('hidden');
            document.getElementById('image-actions').classList.add('hidden');
            
            document.getElementById('result-content').value = data.content;
            
            document.getElementById('result-text-container').classList.remove('hidden');
            document.getElementById('text-actions').classList.remove('hidden');
        }
        
        const visitsText = data.visitsLeft > 0 
            ? `CYCLES LEFT: ${data.visitsLeft}` 
            : 'FINAL CYCLE [DELETED]';
        
        const badge = document.getElementById('visits-left');
        badge.textContent = visitsText;
        if(data.visitsLeft <= 0) {
            badge.classList.add('expired');
        } else {
            badge.classList.remove('expired');
        }

        document.getElementById('retrieve-result').classList.remove('hidden');
        showToast('DECRYPTION SUCCESSFUL');
    } catch (err) {
        showToast(err.message);
    }
}

document.getElementById('retrieve-input').addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        retrieveClipboard();
    }
});

function clearRetrieve() {
    document.getElementById('retrieve-input').value = '';
    document.getElementById('retrieve-result').classList.add('hidden');
    document.getElementById('result-content').value = '';
    document.getElementById('result-image').src = '';
}

function copyLink() {
    if (!currentShareUrl) return;
    navigator.clipboard.writeText(currentShareUrl)
        .then(() => showToast('LINK COPIED TO BUFFER'))
        .catch(() => showToast('ERR: COPY FAILED'));
}

function copyContent() {
    const content = document.getElementById('result-content').value;
    if (!content) return;
    navigator.clipboard.writeText(content)
        .then(() => showToast('DATA COPIED TO BUFFER'))
        .catch(() => showToast('ERR: COPY FAILED'));
}

let toastTimeout;
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
