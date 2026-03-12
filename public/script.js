let currentShareUrl = '';
let currentFile = null;

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const filePreviewContainer = document.getElementById('file-preview-container');
const imagePreview = document.getElementById('image-preview');
const fileMetadata = document.getElementById('file-metadata');
const fileNameDisplay = document.getElementById('file-name');
const fileSizeDisplay = document.getElementById('file-size');
const createInput = document.getElementById('create-input');

// Utilities
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// File handling logic
function handleFile(file) {
    currentFile = file;
    dropzone.classList.add('hidden');
    filePreviewContainer.classList.remove('hidden');
    
    // Reset views
    imagePreview.classList.add('hidden');
    fileMetadata.classList.add('hidden');

    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(event) {
            imagePreview.src = event.target.result;
            imagePreview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else {
        fileNameDisplay.textContent = `> FILE: ${file.name}`;
        fileSizeDisplay.textContent = `> SIZE: ${formatBytes(file.size)}`;
        fileMetadata.classList.remove('hidden');
    }
}

function clearFile() {
    currentFile = null;
    fileInput.value = '';
    filePreviewContainer.classList.add('hidden');
    dropzone.classList.remove('hidden');
    createInput.value = '';
    imagePreview.src = '';
}

// Event Listeners for File Input (Click)
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

// Event Listeners for Drag and Drop
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (document.getElementById('create-tab').classList.contains('active')) {
        dropzone.classList.add('dragover');
    }
});

document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (!document.getElementById('create-tab').classList.contains('active')) return;
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

// Event Listeners for Paste
document.addEventListener('paste', (e) => {
    if (!document.getElementById('create-tab').classList.contains('active')) return;
    // Don't intercept text pastes inside the textarea
    if (e.target === createInput && e.clipboardData.getData('text/plain') !== '') {
        return; 
    }
    
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file') {
            e.preventDefault();
            const file = item.getAsFile();
            if (file) {
                handleFile(file);
                break;
            }
        }
    }
});

// Tab Management
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('c');
    if (code && code.length === 4) {
        showTab('retrieve');
        document.getElementById('retrieve-input').value = code.toUpperCase();
        retrieveClipboard();
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

// API Interactions
async function createClipboard() {
    const formData = new FormData();
    
    if (currentFile) {
        formData.append('type', 'file'); // We unify to 'file' for backend logic
        formData.append('file', currentFile);
    } else {
        const content = createInput.value.trim();
        if (!content) return showToast('ERR: NO DATA DETECTED');
        formData.append('type', 'text');
        formData.append('content', content);
    }

    try {
        const res = await fetch('/api/clipboard', {
            method: 'POST',
            body: formData
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
        
        if (currentFile) clearFile();
        else createInput.value = '';
        
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

        // Hide all result containers first
        document.getElementById('result-text-container').classList.add('hidden');
        document.getElementById('result-image-container').classList.add('hidden');
        document.getElementById('result-file-container').classList.add('hidden');
        document.getElementById('text-actions').classList.add('hidden');
        document.getElementById('image-actions').classList.add('hidden');
        document.getElementById('file-actions').classList.add('hidden');

        if (data.type === 'file' || data.type === 'image') {
            // Note: Since backend unifies to 'file', we determine display by extension/mimetype or just treat everything as file
            // Let's check originalName to see if it's an image
            const isImage = data.originalName && /\.(jpg|jpeg|png|gif|webp|gif|svg)$/i.test(data.originalName);
            
            if (isImage) {
                document.getElementById('result-image').src = data.downloadUrl;
                document.getElementById('download-image-link').href = data.downloadUrl;
                document.getElementById('result-image-container').classList.remove('hidden');
                document.getElementById('image-actions').classList.remove('hidden');
            } else {
                document.getElementById('download-file-name').textContent = `> FILE: ${data.originalName}`;
                document.getElementById('download-file-size').textContent = `> SIZE: ${formatBytes(data.size)}`;
                document.getElementById('download-file-link').href = data.downloadUrl;
                // Add download attribute to force name if possible
                document.getElementById('download-file-link').setAttribute('download', data.originalName);
                
                document.getElementById('result-file-container').classList.remove('hidden');
                document.getElementById('file-actions').classList.remove('hidden');
            }
        } else {
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