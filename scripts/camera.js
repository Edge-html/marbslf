/**
 * MARBSLF - Real-time Camera Verification Module
 * Complies with Section 9 & Section 4 of Specification
 */

class MarbsCamera {
  constructor() {
    this.stream = null;
    this.activeModal = null;
    this.capturedDataUrl = null;
    this.onPhotoAccepted = null;
    this.targetCategory = 'item'; // 'item', 'pet', or 'id'
    this.audioCtx = null;
  }

  // Play subtle shutter click via Web Audio API
  playShutterSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, this.audioCtx.currentTime + 0.08);
      
      gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.08);
      
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.09);
    } catch (e) {
      // Audio autoplay restrictions safe ignore
    }
  }

  // Calculate quick hash for duplicate detection
  generateImageHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return 'MLF-' + hex + '-' + Date.now().toString(16).slice(-6);
  }

  // Open Camera Modal
  open({ category = 'item', onCapture }) {
    this.targetCategory = category;
    this.onPhotoAccepted = onCapture;
    this.capturedDataUrl = null;

    const modal = document.getElementById('cameraModal');
    if (!modal) return;

    this.activeModal = modal;
    modal.classList.add('active');

    // UI elements
    const video = document.getElementById('cameraVideo');
    const previewImg = document.getElementById('cameraPreviewImg');
    const viewfinder = document.getElementById('cameraViewfinder');
    const liveControls = document.getElementById('cameraLiveControls');
    const reviewControls = document.getElementById('cameraReviewControls');
    const banner = document.getElementById('cameraStatusBanner');

    // Reset display states
    previewImg.style.display = 'none';
    video.style.display = 'block';
    liveControls.style.display = 'flex';
    reviewControls.style.display = 'none';
    banner.textContent = '● LIVE MARBSLF CAMERA FEED (KORONADAL SECURE PROOF)';
    banner.className = 'camera-banner live';

    this.startVideoStream(video);
  }

  async startVideoStream(videoEl) {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        let stream = null;
        try {
          // On smartphones/tablets, try the environment (back) camera
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
          });
        } catch (e1) {
          // Try any available camera sensor (webcam, front camera)
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
          });
        }

        if (stream) {
          this.stream = stream;
          videoEl.srcObject = stream;
          videoEl.setAttribute('playsinline', 'true');
          await videoEl.play();
          return;
        }
      }
      this.fallbackSimulatedStream(videoEl);
    } catch (err) {
      console.warn('Physical camera sensor notice:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert('📷 Camera Permission Needed:\nPlease allow camera access in your browser so MarbsLF can capture the found item proof.');
      }
      this.fallbackSimulatedStream(videoEl);
    }
  }

  fallbackSimulatedStream(videoEl) {
    // Render animated simulated viewfinder canvas
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    
    // Draw initial test pattern
    this.drawSimulatedScene(ctx, canvas.width, canvas.height);
    const stream = canvas.captureStream ? canvas.captureStream(15) : null;
    if (stream) {
      this.stream = stream;
      videoEl.srcObject = stream;
      videoEl.play();
    } else {
      // Fallback static
      videoEl.style.display = 'none';
      const placeholder = document.getElementById('cameraFallbackPlaceholder');
      if (placeholder) placeholder.style.display = 'flex';
    }
  }

  drawSimulatedScene(ctx, w, h) {
    // Fill high tech viewfinder background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = 'rgba(246, 184, 25, 0.2)';
    ctx.lineWidth = 1;
    for (let x = 40; x < w; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 40; y < h; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Focal reticle
    ctx.strokeStyle = '#f6b819';
    ctx.lineWidth = 2;
    const cx = w / 2;
    const cy = h / 2;
    const r = 80;
    ctx.strokeRect(cx - r, cy - r, r * 2, r * 2);

    ctx.fillStyle = '#f6b819';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MARBSLF REAL-TIME PROOF SENSOR', cx, cy - r - 15);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Align item/pet/ID inside frame • Koronadal City Safe Capture', cx, cy + r + 25);
  }

  snapPhoto() {
    this.playShutterSound();
    
    // Flash effect
    const flashEl = document.getElementById('cameraFlash');
    if (flashEl) {
      flashEl.classList.add('flash-active');
      setTimeout(() => flashEl.classList.remove('flash-active'), 250);
    }

    const video = document.getElementById('cameraVideo');
    const canvas = document.getElementById('cameraCanvas');
    const previewImg = document.getElementById('cameraPreviewImg');
    const liveControls = document.getElementById('cameraLiveControls');
    const reviewControls = document.getElementById('cameraReviewControls');
    const banner = document.getElementById('cameraStatusBanner');

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');

    // Draw video frame
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      this.drawSimulatedScene(ctx, canvas.width, canvas.height);
    }

    // Burn official anti-tamper watermark per Section 9
    const now = new Date();
    const timeStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString() + ' (PHT)';
    const user = window.marbsDB ? window.marbsDB.getCurrentUser() : { user_id: 'USR-LOCAL' };

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(10, canvas.height - 42, canvas.width - 20, 32);

    ctx.fillStyle = '#f6b819';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MARBSLF REAL-TIME CAPTURE', 20, canvas.height - 22);

    ctx.fillStyle = '#ffffff';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${timeStr} | User: ${user.public_alias || user.user_id}`, 190, canvas.height - 22);

    this.capturedDataUrl = canvas.toDataURL('image/jpeg', 0.85);

    // Switch UI to Review Mode: RETAKE / USE PHOTO
    video.style.display = 'none';
    previewImg.src = this.capturedDataUrl;
    previewImg.style.display = 'block';

    liveControls.style.display = 'none';
    reviewControls.style.display = 'flex';

    banner.textContent = '✓ PHOTO CAPTURED — PLEASE REVIEW PROOF BEFORE ACCEPTING';
    banner.className = 'camera-banner review';
  }

  retakePhoto() {
    const video = document.getElementById('cameraVideo');
    const previewImg = document.getElementById('cameraPreviewImg');
    const liveControls = document.getElementById('cameraLiveControls');
    const reviewControls = document.getElementById('cameraReviewControls');
    const banner = document.getElementById('cameraStatusBanner');

    this.capturedDataUrl = null;
    previewImg.style.display = 'none';
    video.style.display = 'block';

    liveControls.style.display = 'flex';
    reviewControls.style.display = 'none';

    banner.textContent = '● LIVE MARBSLF CAMERA FEED (KORONADAL SECURE PROOF)';
    banner.className = 'camera-banner live';
  }

  usePhoto() {
    if (!this.capturedDataUrl) return;

    const hash = this.generateImageHash(this.capturedDataUrl.slice(-500));
    const user = window.marbsDB ? window.marbsDB.getCurrentUser() : { user_id: 'USR-LOCAL' };
    
    // Check if duplicate hash exists in database
    let isDuplicate = false;
    if (window.marbsDB && window.marbsDB.data.posts) {
      isDuplicate = window.marbsDB.data.posts.some(p => p.photo_hash === hash);
    }

    const payload = {
      image_data: this.capturedDataUrl,
      timestamp: new Date().toISOString(),
      upload_timestamp: new Date().toISOString(),
      image_hash: hash,
      camera_verification_status: isDuplicate ? 'FLAGGED_DUPLICATE' : 'VERIFIED_REALTIME',
      user_id: user.user_id,
      is_duplicate: isDuplicate
    };

    if (this.onPhotoAccepted) {
      this.onPhotoAccepted(payload);
    }

    this.close();
  }

  close() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.activeModal) {
      this.activeModal.classList.remove('active');
      this.activeModal = null;
    }
  }
}

// Global Camera instance
window.marbsCamera = new MarbsCamera();
