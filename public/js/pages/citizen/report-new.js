/**
 * Report Waste form with Live Camera Capture and File Upload.
 *
 * Fields: title, description, image upload / live camera capture, address,
 * latitude / longitude (map picker or "use my location") and date/time.
 * On success the unique complaint ID is displayed with follow-up actions.
 */

import { api } from '../../api.js';
import { icon } from '../../icons.js';
import {
  escapeHtml, toast, setLoading, clearFieldErrors, setFieldError, showFormAlert,
  confirmDialog, validateImageFile, stepper,
} from '../../ui.js';

const DEFAULT_POS = { lat: 12.9716, lng: 77.5946 }; // Bengaluru city centre
let map = null;
let marker = null;
let pickedFile = null;
let objectUrl = null;
let photoSource = null; // 'camera' | 'upload'
let activeMediaStream = null;
let currentFacingMode = 'environment'; // default to rear camera if available

function render() {
  return `
    <div class="page-head">
      <div>
        <h2>Report waste</h2>
        <p class="desc">Take a photo or upload an image of the waste and pinpoint its location. The municipal administrator will review and resolve it.</p>
      </div>
      <div class="head-actions">
        <a class="btn btn-ghost" href="#/reports">${icon('file-text')} My complaints</a>
      </div>
    </div>

    <div id="form-shell">
      <form class="form-panel" id="report-form" novalidate>
        <div class="alert alert-info">${icon('info')}<span>All fields marked with <b>*</b> are required. You can take a live photo using your camera or upload an image under 3 MB.</span></div>

        <div class="panel-grid">
          <!-- Left: report details -->
          <div class="col-7">
            <div class="field" data-field="title">
              <label for="title">Waste title <span class="req">*</span><span class="hint">Short summary</span></label>
              <input class="input" type="text" id="title" name="title" placeholder="e.g. Overflowing garbage near the bus stop" maxlength="120" />
              <span class="field-error"></span>
            </div>

            <div class="field" data-field="description">
              <label for="description">Waste description <span class="req">*</span><span class="hint">min. 10 characters</span></label>
              <textarea class="textarea" id="description" name="description" placeholder="Describe the problem: type of waste, approximate volume, any health or traffic hazard…" style="min-height:130px"></textarea>
              <span class="field-error"></span>
            </div>

            <div class="field" data-field="image">
              <label>Waste photo <span class="req">*</span><span class="hint">Live camera capture or file upload (max 3 MB)</span></label>
              
              <div class="photo-choice-row">
                <button type="button" class="photo-choice-btn" id="open-camera-btn">
                  ${icon('camera')} <span>Take Photo (Camera)</span>
                </button>
                <button type="button" class="photo-choice-btn" id="browse-files-btn">
                  ${icon('upload')} <span>Upload from Device</span>
                </button>
              </div>

              <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Upload or capture waste image">
                <div class="dz-icon">${icon('camera')}</div>
                <p><b>Take a live photo</b> with camera or <b>click / drag &amp; drop</b> an image file</p>
                <p class="dz-hint">A clear photo helps municipal administrators assess the waste volume and take quick action.</p>
              </div>
              <input type="file" id="image-input" name="image" accept="image/jpeg,image/png,image/webp,image/gif" hidden />
              <span class="field-error"></span>
            </div>
          </div>

          <!-- Right: location & date -->
          <div class="col-5">
            <div class="field" data-field="address">
              <label for="address">Location / address <span class="req">*</span></label>
              <input class="input" type="text" id="address" name="address" placeholder="Street, landmark, area" />
              <span class="field-error"></span>
            </div>

            <div class="field" data-field="locality">
              <label for="locality">Locality / zone <span class="hint">optional</span></label>
              <input class="input" type="text" id="locality" name="locality" placeholder="e.g. Indiranagar, Central Zone" />
              <span class="field-error"></span>
            </div>

            <div class="field" data-field="coords">
              <label>Latitude &amp; longitude <span class="req">*</span>
                <button type="button" class="btn btn-soft btn-sm" id="use-location" style="height:30px">${icon('crosshair')} Use my location</button>
              </label>
              <div class="geo-row">
                <input class="input" type="text" inputmode="decimal" id="latitude" name="latitude" placeholder="12.9716" />
                <input class="input" type="text" inputmode="decimal" id="longitude" name="longitude" placeholder="77.5946" />
                <span class="badge badge-category" style="height:46px;padding:0 14px">${icon('map-pin')} Pin</span>
              </div>
              <span class="hint" style="display:block;margin-top:6px">Click anywhere on the map to position the pin.</span>
              <span class="field-error"></span>
            </div>

            <div class="field">
              <label>Map preview</label>
              <div class="picker-map" id="picker-map"></div>
            </div>

            <div class="field" data-field="reportedAt">
              <label for="reportedAt">Date &amp; time observed <span class="req">*</span></label>
              <input class="input" type="datetime-local" id="reportedAt" name="reportedAt" />
              <span class="field-error"></span>
            </div>
          </div>
        </div>

        <hr />
        <div class="form-actions wrap">
          <button class="btn btn-primary btn-lg" type="submit" id="submit-btn">${icon('send')} Submit Complaint</button>
          <button class="btn btn-secondary btn-lg" type="reset" id="reset-btn">${icon('refresh')} Reset</button>
          <span class="text-sm muted">Your complaint is sent directly to municipal administrators for review and resolution.</span>
        </div>
      </form>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Camera Modal Markup                                                 */
/* ------------------------------------------------------------------ */

function cameraModalHtml() {
  return `
  <div class="modal-backdrop" id="camera-modal-backdrop">
    <div class="modal camera-modal">
      <div class="modal-head">
        <div class="flex-center gap-8">
          <span class="icon-tile">${icon('camera')}</span>
          <div>
            <h3>Live Camera Capture</h3>
            <div class="muted text-xs">Align the waste in the viewfinder and click capture</div>
          </div>
        </div>
        <button class="modal-x" id="close-camera-btn" type="button" title="Close camera">${icon('x')}</button>
      </div>

      <div class="modal-body" style="padding:16px;background:#0d1117">
        <div class="camera-viewfinder ${currentFacingMode === 'user' ? 'mirrored' : ''}" id="camera-viewfinder">
          <video id="camera-video" autoplay playsinline muted></video>
          <div class="camera-overlay-grid"></div>
          <div class="camera-corners"></div>
          <div class="camera-flash" id="camera-flash"></div>
          <div id="camera-preview-container" style="display:none;position:absolute;inset:0;background:#000">
            <img id="camera-preview-img" style="width:100%;height:100%;object-fit:cover" alt="Captured preview" />
          </div>
          <canvas id="camera-canvas" style="display:none"></canvas>
        </div>
      </div>

      <div class="camera-controls-bar" id="camera-live-controls">
        <button class="btn btn-ghost btn-sm" id="switch-camera-btn" type="button" style="color:var(--ink-600)">
          ${icon('refresh')} Switch
        </button>
        <button class="shutter-btn" id="shutter-btn" type="button" title="Take photo" aria-label="Capture photo">
          <div class="shutter-inner"></div>
        </button>
        <button class="btn btn-ghost btn-sm" id="cancel-camera-btn" type="button" style="color:var(--ink-600)">
          Cancel
        </button>
      </div>

      <div class="modal-foot" id="camera-review-controls" style="display:none">
        <button class="btn btn-secondary" id="retake-photo-btn" type="button">${icon('refresh')} Retake</button>
        <button class="btn btn-primary" id="use-photo-btn" type="button">${icon('check')} Use This Photo</button>
      </div>
    </div>
  </div>`;
}

/* ------------------------------------------------------------------ */
/* Success screen                                                      */
/* ------------------------------------------------------------------ */

function successScreen(report) {
  return `
  <div class="form-panel center" style="max-width:760px;margin:0 auto">
    <div class="es-icon" style="width:86px;height:86px;border-radius:50%;background:var(--brand-100);color:var(--brand-700);display:grid;place-items:center;margin:6px auto 18px">
      ${icon('check-circle')}
    </div>
    <span class="eyebrow">${icon('star')} Report submitted</span>
    <h2 style="margin:10px 0 8px">Thank you! Your complaint has been registered.</h2>
    <p class="muted" style="max-width:520px;margin:0 auto 22px">Your complaint has been forwarded directly to municipal administrators. Keep your complaint ID to track its resolution.</p>

    <div style="display:inline-flex;align-items:center;gap:12px;background:var(--brand-50);border:1.5px dashed var(--brand-300);border-radius:14px;padding:14px 22px;margin-bottom:26px">
      <span class="text-sm muted" style="font-weight:700">Complaint ID</span>
      <strong style="font-size:1.6rem;letter-spacing:.04em;color:var(--brand-800)">${escapeHtml(report.code)}</strong>
      <button class="btn btn-soft btn-sm" id="copy-code" type="button">${icon('file-text')} Copy</button>
    </div>

    <div style="text-align:left;max-width:620px;margin:0 auto 26px">
      <div class="card card-pad">
        <div class="flex-between" style="margin-bottom:14px">
          <div>
            <div class="strong">${escapeHtml(report.title)}</div>
            <div class="text-sm muted">${escapeHtml(report.locality || report.address)}</div>
          </div>
          ${statusBadgeFor(report.status)}
        </div>
        ${stepper(report.status)}
      </div>
    </div>

    <div class="flex-center wrap" style="justify-content:center">
      <a class="btn btn-primary" href="#/reports/${escapeHtml(report.code)}">${icon('eye')} Track this complaint</a>
      <a class="btn btn-secondary" href="#/report">${icon('plus-circle')} Report another</a>
      <a class="btn btn-ghost" href="#/reports">${icon('file-text')} My complaints</a>
    </div>
  </div>`;
}

function statusBadgeFor(status) {
  const labels = { pending: 'Pending', in_progress: 'In Progress', resolved: 'Resolved' };
  return `<span class="badge badge-${escapeHtml(status)}"><span class="dot"></span>${labels[status] || status}</span>`;
}

/* ------------------------------------------------------------------ */
/* Mount                                                               */
/* ------------------------------------------------------------------ */

function mount(root) {
  const form = document.getElementById('report-form');

  /* 1. Date/time default --------------------------------------------- */
  const dt = document.getElementById('reportedAt');
  const now = new Date();
  now.setSeconds(0, 0);
  dt.value = toLocalInput(now);
  dt.max = toLocalInput(new Date(Date.now() + 5 * 60 * 1000));

  function toLocalInput(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* 2. Photo Handling (Camera + Upload) ------------------------------- */
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('image-input');
  const openCameraBtn = document.getElementById('open-camera-btn');
  const browseFilesBtn = document.getElementById('browse-files-btn');

  // Trigger file chooser
  browseFilesBtn?.addEventListener('click', () => fileInput.click());
  dropzone?.addEventListener('click', () => fileInput.click());
  dropzone?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });

  // Drag & drop
  ['dragenter', 'dragover'].forEach((ev) => dropzone?.addEventListener(ev, (e) => {
    e.preventDefault(); dropzone.classList.add('drag');
  }));
  ['dragleave', 'drop'].forEach((ev) => dropzone?.addEventListener(ev, (e) => {
    e.preventDefault(); dropzone.classList.remove('drag');
  }));
  dropzone?.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file, 'upload');
  });

  fileInput?.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0], 'upload');
  });

  // Trigger camera modal
  openCameraBtn?.addEventListener('click', () => openCameraModal());

  function handleFile(file, source = 'upload') {
    const error = validateImageFile(file);
    const field = form.querySelector('[data-field="image"]');
    if (error) {
      pickedFile = null;
      setFieldError(field, error);
      toast(error, 'error');
      if (fileInput) fileInput.value = '';
      return;
    }
    field.classList.remove('invalid');
    pickedFile = file;
    photoSource = source;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);

    dropzone.classList.add('has-image');
    dropzone.innerHTML = `
      <div class="dz-preview">
        <img src="${objectUrl}" alt="Waste preview" />
        <button type="button" class="dz-remove" id="remove-image">${icon('x')} Remove</button>
      </div>
      <div class="flex-between wrap" style="margin-top:10px;align-items:center">
        <div class="flex-center gap-8">
          <span class="badge ${source === 'camera' ? 'badge-in_progress' : 'badge-category'}">
            ${icon(source === 'camera' ? 'camera' : 'upload')} ${source === 'camera' ? 'Live Camera Capture' : 'Device Upload'}
          </span>
          <span class="text-xs muted">${(file.size / 1024).toFixed(0)} KB</span>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" id="retake-or-replace">
          ${icon('refresh')} Replace photo
        </button>
      </div>`;

    document.getElementById('remove-image')?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearImage();
    });

    document.getElementById('retake-or-replace')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (source === 'camera') openCameraModal();
      else fileInput.click();
    });
  }

  function clearImage() {
    pickedFile = null;
    photoSource = null;
    if (fileInput) fileInput.value = '';
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    dropzone.classList.remove('has-image');
    dropzone.innerHTML = `
      <div class="dz-icon">${icon('camera')}</div>
      <p><b>Take a live photo</b> with camera or <b>click / drag &amp; drop</b> an image file</p>
      <p class="dz-hint">A clear photo helps municipal administrators assess the waste volume and take quick action.</p>`;
  }

  /* ------------------------------------------------------------------ */
  /* Live Camera Stream & Capture Modal                                 */
  /* ------------------------------------------------------------------ */

  async function openCameraModal() {
    stopCameraStream();

    const modalRoot = document.getElementById('modal-root') || document.body;
    const tempDiv = document.createElement('div');
    tempDiv.id = 'camera-modal-wrapper';
    tempDiv.innerHTML = cameraModalHtml();
    modalRoot.appendChild(tempDiv);

    const video = document.getElementById('camera-video');
    const previewContainer = document.getElementById('camera-preview-container');
    const previewImg = document.getElementById('camera-preview-img');
    const canvas = document.getElementById('camera-canvas');
    const flash = document.getElementById('camera-flash');
    const liveControls = document.getElementById('camera-live-controls');
    const reviewControls = document.getElementById('camera-review-controls');
    let capturedBlob = null;

    function closeCamera() {
      stopCameraStream();
      tempDiv.remove();
    }

    document.getElementById('close-camera-btn')?.addEventListener('click', closeCamera);
    document.getElementById('cancel-camera-btn')?.addEventListener('click', closeCamera);
    document.getElementById('camera-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'camera-modal-backdrop') closeCamera();
    });

    // Start video stream
    async function startStream() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Camera API not supported on this browser/device.');
        }

        const constraints = {
          video: {
            facingMode: currentFacingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };

        activeMediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = activeMediaStream;
        await video.play();
      } catch (err) {
        console.warn('getUserMedia failed:', err);
        closeCamera();
        toast('Camera not available or access denied. Opening file selector…', 'warning');
        // Fallback: trigger file input with capture
        fileInput.setAttribute('capture', 'environment');
        fileInput.click();
      }
    }

    await startStream();

    // Switch camera (front/back)
    document.getElementById('switch-camera-btn')?.addEventListener('click', async () => {
      currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
      document.getElementById('camera-viewfinder')?.classList.toggle('mirrored', currentFacingMode === 'user');
      stopCameraStream();
      await startStream();
    });

    // Shutter button (snap photo)
    document.getElementById('shutter-btn')?.addEventListener('click', () => {
      if (!video.videoWidth) return;

      // Trigger flash animation
      flash.classList.add('flash-active');
      setTimeout(() => flash.classList.remove('flash-active'), 120);

      // Draw video frame to canvas
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');

      // Mirror if front camera
      if (currentFacingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (!blob) return;
        capturedBlob = blob;
        const capturedUrl = URL.createObjectURL(blob);
        previewImg.src = capturedUrl;
        previewContainer.style.display = 'block';
        liveControls.style.display = 'none';
        reviewControls.style.display = 'flex';
      }, 'image/jpeg', 0.92);
    });

    // Retake photo
    document.getElementById('retake-photo-btn')?.addEventListener('click', () => {
      previewContainer.style.display = 'none';
      liveControls.style.display = 'flex';
      reviewControls.style.display = 'none';
      capturedBlob = null;
    });

    // Use photo
    document.getElementById('use-photo-btn')?.addEventListener('click', () => {
      if (capturedBlob) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = new File([capturedBlob], `waste-camera-${timestamp}.jpg`, { type: 'image/jpeg' });
        handleFile(file, 'camera');
        toast('Live photo attached successfully!', 'success');
      }
      closeCamera();
    });
  }

  function stopCameraStream() {
    if (activeMediaStream) {
      activeMediaStream.getTracks().forEach((track) => track.stop());
      activeMediaStream = null;
    }
  }

  /* 3. Map picker ------------------------------------------------------ */
  initMap();

  function initMap() {
    if (!window.L) {
      document.getElementById('picker-map').innerHTML = `<div class="loader-inline" style="height:100%">Map unavailable offline</div>`;
      setCoords(DEFAULT_POS.lat, DEFAULT_POS.lng);
      return;
    }
    map = L.map('picker-map', { scrollWheelZoom: false }).setView([DEFAULT_POS.lat, DEFAULT_POS.lng], 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    marker = L.marker([DEFAULT_POS.lat, DEFAULT_POS.lng], { draggable: true }).addTo(map);
    setCoords(DEFAULT_POS.lat, DEFAULT_POS.lng);

    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      setCoords(e.latlng.lat, e.latlng.lng);
    });
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      setCoords(p.lat, p.lng);
    });
    setTimeout(() => map.invalidateSize(), 250);
  }

  function setCoords(lat, lng) {
    document.getElementById('latitude').value = Number(lat).toFixed(6);
    document.getElementById('longitude').value = Number(lng).toFixed(6);
    if (map && marker) {
      const pos = L.latLng(lat, lng);
      if (!marker.getLatLng().equals(pos)) marker.setLatLng(pos);
      map.panTo(pos, { animate: true });
    }
  }

  document.getElementById('use-location').addEventListener('click', () => {
    if (!navigator.geolocation) {
      toast('Geolocation is not supported by this browser.', 'error');
      return;
    }
    const btn = document.getElementById('use-location');
    setLoading(btn, true, 'Locating…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoading(btn, false);
        setCoords(pos.coords.latitude, pos.coords.longitude);
        if (!document.getElementById('address').value.trim()) {
          document.getElementById('address').value = `Near ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
        }
        toast('Location picked from your device GPS.', 'success');
      },
      (err) => {
        setLoading(btn, false);
        toast(`Could not read your location (${err.message}). Please click the map instead.`, 'error');
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 }
    );
  });

  /* 4. Validation helpers --------------------------------------------- */
  function fieldEl(name) { return form.querySelector(`[data-field="${name}"]`); }

  function validateForm() {
    clearFieldErrors(form);
    const v = (n) => (form.elements[n] ? String(form.elements[n].value).trim() : '');
    const title = v('title');
    const description = v('description');
    const address = v('address');
    const lat = v('latitude');
    const lng = v('longitude');
    const reportedAt = v('reportedAt');
    let ok = true;
    const fail = (n, msg) => { setFieldError(fieldEl(n), msg); ok = false; };

    if (!title) fail('title', 'Waste title is required.');
    else if (title.length < 5) fail('title', 'Please use at least 5 characters.');
    if (!description) fail('description', 'Description is required.');
    else if (description.length < 10) fail('description', 'Please describe the issue in at least 10 characters.');
    if (!pickedFile) fail('image', 'Please take a photo with camera or upload a waste image.');
    if (!address) fail('address', 'Location address is required.');
    else if (address.length < 5) fail('address', 'Please enter a more detailed address.');
    if (!lat || !lng || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) fail('coords', 'Latitude and longitude are required - click the map or use your location.');
    else if (Number(lat) < -90 || Number(lat) > 90 || Number(lng) < -180 || Number(lng) > 180) fail('coords', 'Coordinates must be valid latitude / longitude values.');
    if (!reportedAt) fail('reportedAt', 'Please select the date and time you observed this.');
    else if (new Date(reportedAt).getTime() > Date.now() + 5 * 60 * 1000) fail('reportedAt', 'Date and time cannot be in the future.');

    return ok ? {
      title, description, address,
      locality: v('locality'),
      latitude: lat, longitude: lng, reportedAt,
    } : null;
  }

  /* 5. Submit ---------------------------------------------------------- */
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = validateForm();
    if (!values) {
      showFormAlert(form, 'Please correct the highlighted fields before submitting.', 'error');
      form.querySelector('.field.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const proceed = await confirmDialog({
      title: 'Submit this complaint?',
      message: `A complaint ID will be generated for "${values.title}" and forwarded directly to the municipal administrator.`,
      confirmText: 'Submit Complaint',
      cancelText: 'Cancel',
    });
    if (!proceed) return;

    const btn = document.getElementById('submit-btn');
    setLoading(btn, true, 'Uploading…');
    try {
      const fd = new FormData();
      Object.entries(values).forEach(([k, val]) => fd.append(k, val));
      fd.append('image', pickedFile);
      const data = await api.upload('/reports', fd);
      toast(data.message, 'success', 'Complaint submitted');
      const shell = document.getElementById('form-shell');
      shell.innerHTML = successScreen(data.report);
      const copy = document.getElementById('copy-code');
      if (copy) {
        copy.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(data.report.code);
            toast('Complaint ID copied to clipboard.', 'success');
          } catch (err) {
            toast(data.report.code, 'info', 'Complaint ID');
          }
        });
      }
    } catch (err) {
      showFormAlert(form, err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  /* 6. Cleanup --------------------------------------------------------- */
  return () => {
    stopCameraStream();
    if (map) { map.remove(); map = null; }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    document.getElementById('camera-modal-wrapper')?.remove();
  };
}

export default { render, mount };
