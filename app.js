console.info('[modern] app.js start');


// ===== Boot guard =====
const BUILD = '2025-09-29-01';            // palielini, kad maini kodu
if (window.__CADET_APP_BOOTED__ === BUILD) {
  console.warn('[boot] jau palaists, ignorēju otro startu');
} else {
  window.__CADET_APP_BOOTED__ = BUILD;


// Palaist, kad DOM gatavs (strādā visur)
const onDomReady = (fn) => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  } else {
    fn();
  }
};

// Droša piekļuve elementiem
const $id = (id) => document.getElementById(id);






// RAF/CAF
window.requestAnimationFrame = window.requestAnimationFrame
  || window.webkitRequestAnimationFrame
  || window.mozRequestAnimationFrame
  || function(cb){ return setTimeout(cb, 16); };

window.cancelAnimationFrame = window.cancelAnimationFrame
  || window.webkitCancelAnimationFrame
  || window.mozCancelAnimationFrame
  || clearTimeout;

// Idle (Chrome 60 safe)
if (!('requestIdleCallback' in window)) {
  window.requestIdleCallback = function (cb, o) {
    o = o || {};
    return setTimeout(cb, o.timeout || 1);
  };
}
if (!('cancelIdleCallback' in window)) {
  window.cancelIdleCallback = function (id) {
    clearTimeout(id);
  };
}











// -- LKS-92 (EPSG:3059) definīcija proj4
proj4.defs('EPSG:3059',
  '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9996 +x_0=500000 +y_0=-6000000 +ellps=GRS80 +units=m +no_defs +type=crs'
);

// Konvertācijas palīgi
function wgsToLKS(lat, lng){               // ievade: WGS84 lat,lng
  const [x,y] = proj4('EPSG:4326','EPSG:3059',[lng,lat]);
  return {E:x, N:y};
}
function lksToWGS(E, N){                   // atpakaļ uz WGS84
  const [lng,lat] = proj4('EPSG:3059','EPSG:4326',[E,N]);
  return {lat, lng};
}





















// ===== PRELOADER (fix progress binding) =====
onDomReady(() => {
  const pre = document.getElementById('app-preloader');
  if (!pre) return;

  document.body.classList.add('preloading');

  const bar = pre.querySelector('.progress > span');
  const msg = pre.querySelector('.msg');
  const skipBtn = pre.querySelector('#preloaderSkip');

  let total  = 1;  // vismaz viens solis
  let done   = 0;
  let closed = false;

  const render = (pct) => {
    if (bar) bar.style.width = pct + '%';
    if (msg) msg.textContent = `Ielādējam… ${pct}%`;
  };
  const tick = (why) => {
    done = Math.min(done + 1, total);
    render(Math.max(0, Math.min(100, Math.round((done / total) * 100))));
  };

  // sākuma impulss, lai josla nekavējoties izkustas
  tick('boot');

 // ===== Bildes → progress =====
  // Savāc visas aktuālās img; katrai pievieno tick uz load/error
  const imgs = Array.from(document.images || []);
  total += imgs.length;
  imgs.forEach((imgEl) => {
    if (imgEl.complete) {
      // jau kešā → tūlīt skaiti kā pabeigtu
      tick('img-cached');
    } else {
      const onOne = () => tick('img');
      imgEl.addEventListener('load', onOne, { once: true });
      imgEl.addEventListener('error', onOne, { once: true });
    }
  });

  // ===== Leaflet flīzes (ja ieslēgtas) → progress =====
  (function watchTilesIfNeeded(){
    try{
      if (localStorage.getItem('onlineMapActive') !== '1') return;
      const host = document.getElementById('onlineMap');
      if (!host) return;
      const target = 8; let seen = 0;
      total += target;
      const onTile = () => { if (seen < target) { seen++; tick('tile'); } };
      const obs = new MutationObserver(recs=>{
        recs.forEach(r=>{
          r.addedNodes.forEach(n=>{
            if (n && n.tagName === 'IMG' && n.classList.contains('leaflet-tile')) {
              n.addEventListener('load', onTile, { once:true });
              n.addEventListener('error', onTile, { once:true });
            }
          });
        });
      });
      obs.observe(host, { subtree:true, childList:true });
      setTimeout(()=>obs.disconnect(), 4000);
    }catch(_){}
  })();

  // ===== DOM notikumi → progress =====
  const domReady = new Promise((res) => {
    if (document.readyState === 'interactive' || document.readyState === 'complete') res();
    else document.addEventListener('DOMContentLoaded', res, { once: true });
  });
  domReady.then(() => tick('dom'));

  // Skip poga & drošības “fuses”
  const showSkip = setTimeout(() => pre && pre.classList.add('show-skip'), 6000);
  const hardCut  = setTimeout(() => finish('safety-8s'), 8000);
  skipBtn && skipBtn.addEventListener('click', () => finish('skip'));

  // Ātra atvēršana, kad DOM vai bildes ir gatavas (saglabā kā pie tevis)
  // NB: šis joprojām aizvērs pēc ~250ms, bet pa to laiku tiks sasisti vairāki tick()
  const imgPromises = Promise.allSettled(imgs.map(img => {
    return img.complete ? Promise.resolve() : new Promise(r => {
      const done = () => r();
      img.addEventListener('load', done, { once:true });
      img.addEventListener('error', done, { once:true });
    });
  }));
  Promise.race([domReady, imgPromises]).then(() => setTimeout(() => finish('dom-or-img'), 250));

  // Kļūdas arī aizver, kā iepriekš
  window.addEventListener('error', () => finish('window-error'), { once: true });
  window.addEventListener('unhandledrejection', () => finish('unhandledrejection'), { once: true });

  // load → vispirms progress, tad finish
  window.addEventListener('load', () => { tick('window-load'); finish('window-load'); }, { once:true });

  function finish(reason){
    if (closed) return;
    closed = true;
    clearTimeout(showSkip); clearTimeout(hardCut);
    pre.classList.add('hidden');
    document.body.classList.remove('preloading');
    // ja gribi, šeit var uzspiest 100%:
    render(100);
    console.debug('[preloader] finish:', reason, { done, total });
    setTimeout(()=> pre.remove(), 480);
  }
});
// ===== /PRELOADER =====











function debounce(func, wait = 50) {
						  let timeout;
						  return function (...args) {
						    clearTimeout(timeout);
						    timeout = setTimeout(() => func.apply(this, args), wait);
						  };
						}


// — Drošie selektori un notikumu piesaiste —
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const byId = (id) => document.getElementById(id);
const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);




						// Izmanto vizuālo viewport (adreses joslas “elpošana”)
						function updateViewportHeight() {
						  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
						  document.documentElement.style.setProperty('--vh', (h * 0.01) + 'px');
						}
						
						// Arī loga izmēra pārbaude laiž caur vizuālo viewport
function checkWindowSize() {
  const fullscreenMessage = document.getElementById('fullscreenMessage');
  if (!fullscreenMessage) return; // sargs

  const w = window.innerWidth;
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;

  fullscreenMessage.classList.toggle('hidden', (w >= 1024 && h >= 700));
}

						
						function handleResize() {
							if (document.body.classList.contains('print-mode')) return;

						  updateViewportHeight();
						  checkWindowSize();
						  // pārrēķini doku uzreiz (lai nepārklājas ar #about)
						  window.__fitDock && window.__fitDock();
						}
						
						// Sākotnējais un klasiskie notikumi
						window.addEventListener('load', handleResize);
						window.addEventListener('resize', debounce(handleResize, 50));
						window.addEventListener('orientationchange', handleResize);
						
						// Papildu notikumi, kas reaģē uz adreses joslas parādīšanos/paslēpšanos
						if (window.visualViewport) {
						  window.visualViewport.addEventListener('resize', debounce(handleResize, 50));
						  window.visualViewport.addEventListener('scroll', debounce(handleResize, 50));
						}


                        // Dinamiskās pogas konfigurācija: katrai pogai sākuma un alternatīvie attēli
						const buttonImageMap = {
							"toggleRotationMode": {
								defaultSrc: "img/ROTATE_COMPASS_BASE.png",
								alternateSrc: "img/ROTATE_COMPASS_SCALE.png"
							},
							"lockRotationMode": {
								defaultSrc: "img/COMPASS_ROTATE_UNLOCK.png",
								alternateSrc: "img/COMPASS_ROTATE_LOCK.png"
							}
						};



						// Funkcija, kas maina attēlus uz pogām
function toggleButtonImage(buttonId) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  const img = button.querySelector('img');
  const config = buttonImageMap[buttonId];
  if (!img || !config) return;

  const cur = img.getAttribute('src'); // salīdzinām ar oriģinālo atributu
  img.setAttribute('src', cur === config.defaultSrc ? config.alternateSrc : config.defaultSrc);
}


						// Pievienojam notikumus pogām
var _tgl = document.getElementById('toggleRotationMode');
if (_tgl) _tgl.addEventListener('click', function(){ toggleButtonImage('toggleRotationMode'); });

var _lck = document.getElementById('lockRotationMode');
if (_lck) _lck.addEventListener('click', function(){ toggleButtonImage('lockRotationMode'); });



						(function() {
							let previousTouchPoints = navigator.maxTouchPoints;

							/**
							 * Funkcija, kas pārbauda, vai ir pievienota vai atvienota skārienjūtīgā ierīce.
							 * Parāda ziņojumu un aktivizē pogas ar klasi .touch-only.
							 */
							function checkTouchscreenStatus() {
								const currentTouchPoints = navigator.maxTouchPoints;
								const touchscreenPopup = document.getElementById('touchscreenPopup');
								
								if (currentTouchPoints > previousTouchPoints) {
									console.log('🟢 Pievienota ārējā skārienjūtīgā ierīce. Aktivizētas papildu pogas!');
									showPopupMessage('Pievienota ārējā skārienjūtīgā ierīce. Aktivizētas papildu pogas!', 'popup-success');
									showTouchOnlyButtons();
								} else if (currentTouchPoints < previousTouchPoints) {
									console.log('🔴 Atvienota ārējā skārienjūtīgā ierīce. Papildu pogas paslēptas!');
									showPopupMessage('Atvienota ārējā skārienjūtīgā ierīce. Papildu pogas paslēptas!', 'popup-error');
									hideTouchOnlyButtons();
								}

								previousTouchPoints = currentTouchPoints;
							}

							/**
							 * Funkcija, kas parāda uznirstošo paziņojumu.
							 * @param {string} message - Ziņojuma teksts.
							 * @param {string} popupClass - Papildu klases nosaukums ('popup-success' vai 'popup-error').
							 */
							function showPopupMessage(message, popupClass) {
								const popup = document.getElementById('touchscreenPopup');
								popup.textContent = message;
								popup.classList.remove('popup-success', 'popup-error');
								popup.classList.add(popupClass);
								popup.style.display = 'block';

								setTimeout(() => {
									popup.style.display = 'none';
								}, 5000); // Parāda ziņojumu 5 sekundes
							}

							/** Palīgfunkcijas touch-only pogām */						
							function showTouchOnlyButtons() {
							  const touchOnlyElements = document.querySelectorAll('.touch-only');
							  touchOnlyElements.forEach(el => {
							    el.classList.add('touch-visible');
							    el.style.display = 'inline-block';
							  });
							
							  // pārrēķina slīdņa “span” pēc pogu skaita
							  window.__updateDimmerWidth && window.__updateDimmerWidth();
							  // (neobligāti) pielāgo arī doka mērogu
							  window.__fitDock && window.__fitDock();
							
							  console.log('✅ Skārienjūtīgās pogas ir redzamas.');
							}
							
							function hideTouchOnlyButtons() {
							  const touchOnlyElements = document.querySelectorAll('.touch-only');
							  touchOnlyElements.forEach(el => {
							    el.classList.remove('touch-visible');
							    el.style.display = 'none';
							  });
							
							  // pārrēķina slīdņa “span” pēc pogu skaita
							  window.__updateDimmerWidth && window.__updateDimmerWidth();
							  // (neobligāti) pielāgo arī doka mērogu
							  window.__fitDock && window.__fitDock();
							
							  console.log('❌ Skārienjūtīgās pogas ir paslēptas.');
							}
							

							/**
							 * Funkcija, kas uzsāk pārbaudi ik pēc 1 sekundes, vai ir pievienota skārienjūtīga ierīce.
							 */
							function startContinuousCheck() {
								setInterval(checkTouchscreenStatus, 3000); // Pārbauda ik pēc 1 sekundes
							}

							/**
							 * Funkcija, kas tiek izsaukta, kad pievieno jaunas USB vai citas ārējās ierīces.
							 */
							function listenForDeviceChanges() {
								if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
									navigator.mediaDevices.addEventListener('devicechange', () => {
										console.log('🔄 Konstatētas ierīču izmaiņas.');
										checkTouchscreenStatus();
									});
								}
							}

							/**
							 * Sākotnējais process, kas tiek izsaukts, kad logs ir ielādēts.
							 */
							window.addEventListener('load', () => {
								checkTouchscreenStatus(); // Pārbauda statusu, kad lapa tiek ielādēta
								startContinuousCheck(); // Sāk nepārtrauktu pārbaudi ik pēc 1 sekundes
								listenForDeviceChanges(); // Sāk klausīties, kad pievieno vai atvieno ierīces
							});

							/**
							 * Notikuma klausītājs pointerdown notikumam.
							 * Ja konstatēts pieskāriens, parāda touch-only pogas.
							 */
							window.addEventListener('pointerdown', (event) => {
								if (event.pointerType === 'touch') {
									console.log('🟢 Pieskāriens atklāts.');
									showTouchOnlyButtons();
								}
							});
						})();



						// Funkcija, kas pārbauda ierīces orientāciju
function checkOrientation() {
  const overlay = document.getElementById('orientation-overlay');
  if (!overlay) return;
  overlay.style.display = window.matchMedia("(orientation: portrait)").matches ? 'flex' : 'none';
}



						// Funkcija pārbauda, vai tiek izmantots viedtālrunis ar mazu ekrānu
function showMobileWarning() {
  const warningElement = document.getElementById('mobile-warning');
  if (!warningElement) return;

  const isMobileDevice = /iphone|ipod|android.*mobile|windows phone|iemobile|opera mini/.test(navigator.userAgent.toLowerCase());
  const isSmallScreen = window.innerWidth < 900;

  warningElement.style.display = (isMobileDevice && isSmallScreen) ? 'flex' : 'none';
}


						// Notikumu klausītāji
						window.addEventListener('load', showMobileWarning);
						window.addEventListener('resize', showMobileWarning);

						// Izsaucam funkciju sākumā un pie orientācijas izmaiņām
						checkOrientation();
						window.addEventListener('resize', checkOrientation);
						window.addEventListener('orientationchange', checkOrientation);

						// Funkcija, kas aizver abas izvēlnes
// 1) closeBothMenus – ar null sargiem
function closeBothMenus() {
  const left  = document.querySelector('.position-selector-left');
  const right = document.querySelector('.position-selector');

  left  && left.classList.add('hidden-left');
  right && right.classList.add('hidden');

  const leftBtn  = document.querySelector('.toggle-selector-left');
  const rightBtn = document.querySelector('.toggle-selector');
  if (leftBtn)  leftBtn.textContent  = '❯';
  if (rightBtn) rightBtn.textContent = '❮';

  window.__updateMapSafeAreas && window.__updateMapSafeAreas();
}

// === DROŠI sasienam pozīciju paneļu pogas un <select>us ===
(function(){
  const rightToggleBtn  = document.querySelector('.toggle-selector');
  const rightPanel      = document.querySelector('.position-selector');
  const leftToggleBtn   = document.querySelector('.toggle-selector-left');
  const leftPanel       = document.querySelector('.position-selector-left');

  // labā poga
  on(rightToggleBtn, 'click', () => {
    if (!rightPanel) return;
    if (rightPanel.classList.contains('hidden')) {
      rightPanel.classList.remove('hidden');
      rightToggleBtn && (rightToggleBtn.textContent = '❯'); // bultiņa uz aizvēršanu
    } else {
      closeBothMenus();
    }
  });

  // kreisā poga
  on(leftToggleBtn, 'click', () => {
    if (!leftPanel) return;
    if (leftPanel.classList.contains('hidden-left')) {
      leftPanel.classList.remove('hidden-left');
      leftToggleBtn && (leftToggleBtn.textContent = '❮'); // bultiņa uz aizvēršanu
    } else {
      closeBothMenus();
    }
  });


						// Funkcija, kas sinhronizē izvēles abās izvēlnēs
// 2) syncSelectOptions – arī ar null sargiem
function syncSelectOptions(selectedValue) {
  const leftSel  = document.getElementById('positionSelectLeft');
  const rightSel = document.getElementById('positionSelect');
  if (leftSel)  leftSel.value  = selectedValue;
  if (rightSel) rightSel.value = selectedValue;
}

 // <select> klausītāji (sinhronizē abos paneļos)
  const leftSelect  = document.getElementById('positionSelectLeft');
  const rightSelect = document.getElementById('positionSelect');

  on(leftSelect,  'change', () => {
    const v = leftSelect.value;
    syncSelectOptions(v);
    closeBothMenus();
    updateButtonContainerPosition(v);
  });

  on(rightSelect, 'change', () => {
    const v = rightSelect.value;
    syncSelectOptions(v);
    closeBothMenus();
    updateButtonContainerPosition(v);
  });


						const savedPosition = localStorage.getItem('buttonPosition');
						const valid = ['bottom', 'left', 'right'];
						const initial = valid.includes(savedPosition) ? savedPosition : 'bottom';
						
						syncSelectOptions(initial);
						updateButtonContainerPosition(initial);


						// Funkcija, kas atjaunina pogas konteinera novietojumu atkarībā no izvēlētās vērtības
// 3) updateButtonContainerPosition – izsauc arī slīdņa orientāciju
function updateButtonContainerPosition(position){
  const buttonContainer = document.getElementById('buttonContainer');
  if (!buttonContainer) return;

  buttonContainer.classList.remove('bottom','right','left');
  buttonContainer.classList.add(position);

  localStorage.setItem('buttonPosition', position);

  window.__fitDock && window.__fitDock();
  window.__updateDimmerWidth && window.__updateDimmerWidth();

  // ← lai uzreiz pārslēdzas vert./horiz. slīdnis
  syncRangeOrientation();
}



						function syncRangeOrientation(){
						  const bc    = document.getElementById('buttonContainer');
						  const range = document.getElementById('mapDimmerRange');
						  if(!bc || !range) return;
						
						  const side = bc.classList.contains('left') || bc.classList.contains('right');
						
						  if(side){
						    range.classList.add('range-vertical');       // CSS hakiem (Chrome/Edge)
						    range.setAttribute('orient','vertical');     // Firefoxam obligāti
						  }else{
						    range.classList.remove('range-vertical');
						    range.removeAttribute('orient');
						  }
						}
						
						
						// izsauc uzreiz un katru reizi pēc pozīcijas maiņas
						syncRangeOrientation();
						
						

const _oldUpdatePos = updateButtonContainerPosition;
updateButtonContainerPosition = function(position){
  _oldUpdatePos(position);
  syncRangeOrientation();
  window.__updateDimmerWidth && window.__updateDimmerWidth();
  window.__fitDock && window.__fitDock();
  window.__updateMapSafeAreas && window.__updateMapSafeAreas(); //  pievieno šo
};


						document.addEventListener('DOMContentLoaded', () => {
							// Atlasām kreisās puses pogu
							const leftToggleButton = document.querySelector('.toggle-selector-left');
							const leftPositionSelector = document.querySelector('.position-selector-left');
							if (!leftToggleButton || !leftPositionSelector) return; //  pievieno šo

						// Pārbaudām, vai izvēlne ir redzama vai paslēpta, un iestatām bultiņas virzienu
						if (leftPositionSelector.classList.contains('hidden-left')) {
								leftToggleButton.textContent = '❯'; // Izvēlne ir paslēpta, bultiņa uz priekšu
							} else {
								leftToggleButton.textContent = '❮'; // Izvēlne ir redzama, bultiņa uz iekšu
							}
						
	// kreisais panelis			
	//						if (!leftPositionSelector.classList.contains('hidden-left')) {
	//						leftPositionSelector.classList.add('hidden-left'); 
	//						}
						});

})();						














// ===== LEGACY-SAFE paneļu auto-demonstrācija un auto-aizvēršana =====

// Palīgi veciem pārlūkiem
function qs(sel){ return document.querySelector(sel); }
function hasClass(el, c){ if(!el) return false; return ('classList' in el) ? el.classList.contains(c) : new RegExp('(^|\\s)'+c+'(\\s|$)').test(el.className); }
function addClass(el, c){
  if(!el) return;
  if('classList' in el){ el.classList.add(c); }
  else if(!hasClass(el,c)){ el.className = (el.className+' '+c).replace(/\s+/g,' ').trim(); }
}
function removeClass(el, c){
  if(!el) return;
  if('classList' in el){ el.classList.remove(c); }
  else { el.className = el.className.replace(new RegExp('(^|\\s)'+c+'(\\s|$)','g'),' ').replace(/\s+/g,' ').trim(); }
}
function setBtnText(btn, txt){ if(!btn) return; if('textContent' in btn) btn.textContent = txt; else btn.innerText = txt; }

// Konstantes
var LEFT_PANEL_SEL  = '.position-selector-left';
var RIGHT_PANEL_SEL = '.position-selector';
var LEFT_BTN_SEL    = '.toggle-selector-left';
var RIGHT_BTN_SEL   = '.toggle-selector';

// Drošs “closeBoth” ar bultiņu sinhronizāciju
function closeBothSelectorsLegacy(){
  var leftPanel  = qs(LEFT_PANEL_SEL);
  var rightPanel = qs(RIGHT_PANEL_SEL);
  var leftBtn    = qs(LEFT_BTN_SEL);
  var rightBtn   = qs(RIGHT_BTN_SEL);

  if(leftPanel){ addClass(leftPanel, 'hidden-left'); }
  if(rightPanel){ addClass(rightPanel, 'hidden'); }

  // bultiņas “AIZVĒRTS” stāvoklim
  setBtnText(leftBtn,  '❯'); // kreisais aizvērts = “atvērt pa labi”
  setBtnText(rightBtn, '❮'); // labais  aizvērts = “atvērt pa kreisi”

  if(window.__updateMapSafeAreas) window.__updateMapSafeAreas();
}

// Parādīt abus (uz īsu brīdi)
function showBothSelectorsOnce(){
  var leftPanel  = qs(LEFT_PANEL_SEL);
  var rightPanel = qs(RIGHT_PANEL_SEL);
  if(leftPanel){ removeClass(leftPanel, 'hidden-left'); removeClass(leftPanel, 'hidden'); }
  if(rightPanel){ removeClass(rightPanel, 'hidden'); }
  if(window.__updateMapSafeAreas) window.__updateMapSafeAreas();
}

// DEMO: pēc ielādes parāda un pēc N ms aizver ar pareizām bultiņām
function demoSelectorsAutoCloseLegacy(delayMs){
  delayMs = (+delayMs||0) > 0 ? +delayMs : 5000;
  showBothSelectorsOnce();
  if(demoSelectorsAutoCloseLegacy._t) clearTimeout(demoSelectorsAutoCloseLegacy._t);
  demoSelectorsAutoCloseLegacy._t = setTimeout(closeBothSelectorsLegacy, delayMs);
}

// === Auto-aizvēršana bez aktivitātes panelī N sekundes (legacy events) ===
function armSelectorIdleCloseLegacy(panel, delayMs){
  if(!panel) return;
  delayMs = (+delayMs||0) > 0 ? +delayMs : 5000;

  // Notīri iepriekšējo “watcher”
  if(panel._idleCleanup){ panel._idleCleanup(); }

  var isLeft = hasClass(panel, 'position-selector-left');
  var btn = qs(isLeft ? LEFT_BTN_SEL : RIGHT_BTN_SEL);
  var tId = null;

  function close(){
    if(isLeft){ addClass(panel, 'hidden-left'); setBtnText(btn,'❯'); }
    else      { addClass(panel, 'hidden');      setBtnText(btn,'❮'); }
    if(window.__updateMapSafeAreas) window.__updateMapSafeAreas();
    cleanup();
  }
  function reset(){
    if(tId) clearTimeout(tId);
    tId = setTimeout(close, delayMs);
  }

  // “Aktivitātes” notikumi ar legacy variantiem
  var evs = [
    'pointerdown','pointermove',       // moderni
    'mousedown','mousemove','mouseup', // pele (fallback)
    'touchstart','touchmove','touchend', // touch (legacy)
    'wheel','mousewheel','DOMMouseScroll', // ritenis (vecie Firefox/IE)
    'keydown','keyup','input','change','focus','focusin','click'
  ];
  function handler(){ reset(); }

  for(var i=0;i<evs.length;i++){
    try{ panel.addEventListener(evs[i], handler, true); }catch(e){}
  }
  // startē pirmais countdown
  reset();

  function cleanup(){
    if(tId) clearTimeout(tId);
    for(var i=0;i<evs.length;i++){
      try{ panel.removeEventListener(evs[i], handler, true); }catch(e){}
    }
    panel._idleCleanup = null;
  }
  panel._idleCleanup = cleanup;
}

// Piesaisti taimeri tūlīt pēc atvēršanas ar tavu pogu
function bindAutoCloseOnToggleLegacy(){
  var leftBtn  = qs(LEFT_BTN_SEL);
  var rightBtn = qs(RIGHT_BTN_SEL);
  var leftPanel  = qs(LEFT_PANEL_SEL);
  var rightPanel = qs(RIGHT_PANEL_SEL);

  if(rightBtn && rightPanel){
    rightBtn.addEventListener('click', function(){
      // ja pēc klikšķa panelis ir atvērts, armē taimeri; ja aizvērts — notīri
      if(!hasClass(rightPanel, 'hidden')) armSelectorIdleCloseLegacy(rightPanel, 5000);
      else if(rightPanel._idleCleanup) rightPanel._idleCleanup();
    }, false);
  }
  if(leftBtn && leftPanel){
    leftBtn.addEventListener('click', function(){
      if(!hasClass(leftPanel, 'hidden-left')) armSelectorIdleCloseLegacy(leftPanel, 5000);
      else if(leftPanel._idleCleanup) leftPanel._idleCleanup();
    }, false);
  }
}


// Startē gan uz DOMContentLoaded, gan uz load (legacy drošībai)
(function () {
  function startAll() {
    if (typeof bindAutoCloseOnToggleLegacy === 'function') {
      bindAutoCloseOnToggleLegacy();
    }
    if (typeof demoSelectorsAutoCloseLegacy === 'function') {
      demoSelectorsAutoCloseLegacy(5000); // aizver pēc 5s, ja neatver/nelieto
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startAll, { once: true });
  } else {
    startAll();
  }
  // Drošībai – ja kaut kas ielādējas vēlu
  window.addEventListener('load', startAll, { once: true });
})();






























const canvas = document.getElementById('mapCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
						const img = new Image();
// img.src = '';



function hasImage(){
  return !!img.src && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
}

img.addEventListener('load', () => {
  adjustImageSize();
  drawImage();              // drawImage pati parādīs rokturi tikai, ja bilde ir gatava
}, { once: false });

img.addEventListener('error', () => {
  console.warn('Attēlu neizdevās ielādēt');
  drawImage();              // izsauksies ar “tukšu” stāvokli – rokturis paliks paslēpts
});









						let imgX = 0, imgY = 0;
						let imgScale = 1;
						let imgWidth, imgHeight;
						let dragging = false;
						let resizing = false;
						let startX, startY;
						let startWidth, startHeight;
						let lastTouchDistance = 0;
						const initialScale = 0.9;

						// Tumšošanas intensitāte (0..0.8), glabājam % localStorage (0..80)
						let mapDarken = (+(localStorage.getItem('mapDarken') || 0)) / 100;
		// Tumšuma vērtība (%) → saglabā, uzliek canvas un onlineMap
function setDarkness(percent){
  // 0..80 (%), canvas izmantos 0..0.8
  const p = Math.max(0, Math.min(80, +percent || 0));
  localStorage.setItem('mapDarken', String(p));
  mapDarken = p / 100;

  // onlineMap pārklājums
  const dim = document.getElementById('onlineMapDim');
  if (dim) dim.style.background = 'rgba(0,0,0,' + Math.min(0.8, mapDarken) + ')';

  // ja ir slīdnis — atjauno CSS progresu (tavs CSS lieto --p)
  const rng = document.getElementById('mapDimmerRange');
  if (rng) rng.style.setProperty('--p', p);

  // pārzzīmējam kanvu (tumšums uz attēla)
  if (typeof drawImage === 'function') drawImage();
}
				



const resizeHandle = document.getElementById('resizeHandle');


if (resizeHandle && !resizeHandle.dataset.bound) {
  resizeHandle.addEventListener('mousedown', startResize);
  resizeHandle.addEventListener('touchstart', startResize, { passive: false });
  resizeHandle.dataset.bound = '1';
}




  // lai roktura <img> aizņem visu un netraucē klikam
 // const icon = resizeHandle.querySelector('img');
// lai roktura <img> aizņem visu un netraucē klikam
const icon = resizeHandle ? resizeHandle.querySelector('img') : null;
  if (icon) {
    Object.assign(icon.style, {
      width: '100%', height: '100%', display: 'block', pointerEvents: 'none'
    });
  }





















// === DEVTOOL bridge: __devtoolSend(channel, type, data) ======================
(function(){
  if (window.__devtoolSend) return;

  const q = [];
  function tryDispatch(msg){
    // 1) Mans devtool ar .push(msg) vai .event(channel,type,data)
    const d = window.__devtool;
    if (d && typeof d.push === 'function') { d.push(msg); return true; }
    if (d && typeof d.event === 'function'){ d.event(msg.channel, msg.type, msg.data); return true; }
    // 2) Alternatīva globāla funkcija
    if (typeof window.__devlog === 'function'){ window.__devlog(msg); return true; }
    return false;
  }
  function flush(){
    let sent = false;
    for (let i=0;i<q.length;i++){
      if (tryDispatch(q[i])) { q.splice(i,1); i--; sent = true; }
      else break;
    }
    return sent;
  }

  window.__devtoolSend = function(channel, type, data){
    const msg = { channel, type, data, t: Date.now() };
    // sūti uz devtool, ja jau gatavs; citādi rindā
    if (!tryDispatch(msg)) q.push(msg);
    // broadcast arī ar postMessage (ja tavs devtool to klausās)
    try { window.postMessage({ __devtool: true, ...msg }, '*'); } catch(_){}
  };

  // ik pa laikam pamēģini izsūtīt rindā sakrājušos
  setInterval(flush, 800);
})();











































(function(){
  const mapDiv   = document.getElementById('onlineMap');
  const mapDim   = document.getElementById('onlineMapDim');
	if (mapDiv && mapDim && mapDim.parentElement !== mapDiv) {
  mapDiv.appendChild(mapDim);
}
  const btn      = document.getElementById('toggleOnlineMap');
  const canvas   = document.getElementById('mapCanvas');
  const resizeH  = document.getElementById('resizeHandle');
  const dimRange = document.getElementById('mapDimmerRange');

  let map, inited = false;



/* === SAFE AREAS kalkulācija kartes kontrolēm (augša/apakša) === */

(function(){
  const topSelectors = [
    '#fullscreenMessage:not(.fs-message-hidden)',
    '.top-bar',
    '.dropdown-menu.visible',
    '#contentFrame.active',
    '#instructionFrame.active'
    // ⬅️ NOŅEMAM .position-selector un .position-selector-left,
    // lai sānu paneļi neietekmētu top drošo zonu
  ];

  const bottomSelectors = [
    '#about',
    '#iframeContainerAbout',
    '#iframeContainerQR'
  ];

  function visibleOverlapTop(el){
    const st = getComputedStyle(el);





	  
    const r = el.getBoundingClientRect();
    // “nederīgs/neredzams” elements
    if (st.display === 'none' || st.visibility === 'hidden' || r.width === 0 || r.height === 0) return 0;

    // Skaitām tikai elementus, kas tiešām ietekmē AUGŠU:
    //  - platus (>= 50% no viewport platuma) UN
    //  - atrodas pašā augšā (r.top tuvu 0) vai ir "fixed" un aizsedz augšējo joslu
    const isWide = r.width >= window.innerWidth * 0.5;
    const nearTop = r.top <= 12; // ~12px no ekrāna augšas
    const pinnedTop = (st.position === 'fixed' && r.top < 40); // fixed pārklājums pie augšas

    if (!isWide || !(nearTop || pinnedTop)) return 0;

    const TOP_BAND = Math.min(180, Math.round(window.innerHeight * 0.22));
    const intersects = r.top < TOP_BAND && r.bottom > 0;
    if (!intersects) return 0;

    return Math.max(0, Math.min(r.bottom, TOP_BAND));
  }

  function visibleOverlapBottom(el){
    const st = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (st.display === 'none' || st.visibility === 'hidden' || r.width === 0 || r.height === 0) return 0;
    const H = window.innerHeight;
    const BOTTOM_BAND = Math.min(220, Math.round(H * 0.28));
    const intersects = r.bottom > (H - BOTTOM_BAND) && r.top < H;
    if (!intersects) return 0;
    return Math.max(0, Math.min(r.bottom, H) - Math.max(r.top, H - BOTTOM_BAND));
  }

  function getTopSafePx(){
    let px = 0;
    topSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { px = Math.max(px, visibleOverlapTop(el)); });
    });
    return Math.round(px);
  }

  function getBottomSafePx(){
    let px = 0;
    bottomSelectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => { px = Math.max(px, visibleOverlapBottom(el)); });
    });
    return Math.round(px);
  }

  function updateMapSafeAreas(){
	  if (document.body && document.body.classList.contains('print-mode')) return;

    const topPx    = getTopSafePx();
    const bottomPx = getBottomSafePx();
    document.documentElement.style.setProperty('--map-top-safe',    topPx + 'px');
    document.documentElement.style.setProperty('--map-bottom-safe', bottomPx + 'px');
    document.documentElement.style.setProperty('--map-bottom-gap', '35px');
    try { map && map.invalidateSize(true); } catch(e){}
  }

  window.__updateMapSafeAreas = updateMapSafeAreas;

  const call = () => setTimeout(updateMapSafeAreas, 0);
  window.addEventListener('load', call);
  window.addEventListener('resize', call);
  window.addEventListener('orientationchange', call);
  if (window.visualViewport){
    window.visualViewport.addEventListener('resize', call);
    window.visualViewport.addEventListener('scroll', call);
  }
})();




	

  /* ---------- POPUP STILS (pielāgo “dock-shell” vizuālam) ---------- */
  (function injectPopupCSS(){
    const css = `
      .leaflet-container .coord-popup{
        min-width: 320px;
        padding: 10px 12px;
      }
      .leaflet-container .coord-row{
        display:flex; align-items:center; gap:8px;
        margin:6px 0;
        color: #fff;
        font: 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      }
      .leaflet-container .coord-row .label{
        color:#cfd6e4; opacity:.9; min-width:72px;
      }
      .leaflet-container .coord-row .value{
        flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        font-weight:600; color:#ffffff;
      }
      .leaflet-container .copy-btn{
        flex:0 0 auto;
        display:inline-grid; place-items:center;
        width:30px; height:30px; border-radius:8px;
        background: linear-gradient(180deg, var(--dock1, #1b1f25), var(--dock2, #490000a8));
        border:1px solid rgba(255,255,255,.06);
        box-shadow: 0 6px 16px rgba(0,0,0,.35);
        color:#eef2f7; cursor:pointer;
        transition: transform .12s ease, background-color .2s ease, border-color .2s ease;
      }
      .leaflet-container .copy-btn:hover{ transform: scale(1.06); }
      .leaflet-container .copy-btn:active{ transform: scale(.95); }
      .leaflet-container .copy-btn svg{ width:18px; height:18px; display:block; }
      .leaflet-container .copy-btn.copied{
        background:#1f7a36; border-color:#2bd169;
      }
      .leaflet-container .copied-msg{
        margin-left:4px; font-size:12px; color:#2bd169; opacity:0; transition:opacity .2s;
      }
      .leaflet-container .copied-msg.show{ opacity:1; }

      /* pārrakstām Leaflet popup “balto” čaulu uz tumšu dock stilā */
      .leaflet-popup-content-wrapper{
        background: linear-gradient(180deg, var(--dock1, #1b1f25), var(--dock2, #2a0f0faa));
        color:#fff; border-radius:16px;
        border:1px solid rgba(255,255,255,.06);
        box-shadow: 0 12px 28px rgba(0,0,0,.45), 0 2px 6px rgba(0,0,0,.35);
      }
      .leaflet-popup-tip{
        background: linear-gradient(180deg, var(--dock1, #1b1f25), var(--dock2, #2a0f0faa));
        border:1px solid rgba(255,255,255,.06);
      }

      /* lai slāņu kontrole noteikti ir redzama virs kartes */
      .leaflet-control{ z-index: 500; }
#onlineMap .leaflet-top    { top:    calc(var(--map-top-safe, 0px) + 10px); }
#onlineMap .leaflet-bottom { bottom: calc(var(--map-bottom-safe, 0px) + 10px); }
#onlineMap .leaflet-control { z-index: 500; }
#onlineMap .leaflet-popup   { z-index: 600; }
    `;
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
  })();

  /* ---------------------- MGRS (8 cipari) ---------------------- */
  // WGS84 konstantes
  const a = 6378137.0, f = 1/298.257223563, k0 = 0.9996;
  const e2 = f*(2-f), ep2 = e2/(1-e2);

  const deg2rad = d => d*Math.PI/180;

  function utmZone(lon){
    let z = Math.floor((lon + 180)/6) + 1;
    return z;
  }
  // Īpašie gadījumi (Norvēģija / Svalbāra)
  function utmZoneSpecial(lat, lon, z){
    if (lat>=56 && lat<64 && lon>=3 && lon<12) return 32;
    if (lat>=72 && lat<84){
      if (lon>=0   && lon<9 ) return 31;
      if (lon>=9   && lon<21) return 33;
      if (lon>=21  && lon<33) return 35;
      if (lon>=33  && lon<42) return 37;
    }
    return z;
  }

  function latBandLetter(lat){
    const bands = "CDEFGHJKLMNPQRSTUVWX"; // 8° joslas, X ir 12°
    const idx = Math.floor((lat + 80) / 8);
    if (idx<0) return 'C';
    if (idx>19) return 'X';
    return bands[idx];
  }

  function llToUTM(lat, lon){
    let zone = utmZone(lon);
    zone = utmZoneSpecial(lat, lon, zone);

    const phi = deg2rad(lat);
    const lam = deg2rad(lon);
    const lam0 = deg2rad((zone-1)*6 - 180 + 3);

    const N = a / Math.sqrt(1 - e2*Math.sin(phi)*Math.sin(phi));
    const T = Math.tan(phi)*Math.tan(phi);
    const C = ep2 * Math.cos(phi)*Math.cos(phi);
    const A = Math.cos(phi) * (lam - lam0);

    const M = a*((1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256)*phi
            - (3*e2/8 + 3*e2*e2/32 + 45*e2*e2*e2/1024)*Math.sin(2*phi)
            + (15*e2*e2/256 + 45*e2*e2*e2/1024)*Math.sin(4*phi)
            - (35*e2*e2*e2/3072)*Math.sin(6*phi));

    let easting  = k0 * N * (A + (1-T+C)*Math.pow(A,3)/6 + (5-18*T+T*T+72*C-58*ep2)*Math.pow(A,5)/120) + 500000.0;
    let northing = k0 * (M + N*Math.tan(phi)*(A*A/2 + (5-T+9*C+4*C*C)*Math.pow(A,4)/24 + (61-58*T+T*T+600*C-330*ep2)*Math.pow(A,6)/720));
    const hemi = (lat >= 0) ? 'N' : 'S';
    if (lat < 0) northing += 10000000.0;

    return {zone, hemi, easting, northing, band: latBandLetter(lat)};
  }




// --- LL -> UTM piespiedu zonā (globāli pieejama) ---
if (!window.llToUTMInZone) {
  window.llToUTMInZone = function llToUTMInZone(lat, lon, zone) {
    const phi  = deg2rad(lat);
    const lam  = deg2rad(lon);
    const lam0 = deg2rad((zone - 1) * 6 - 180 + 3);

    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi));
    const T = Math.tan(phi) * Math.tan(phi);
    const C = ep2 * Math.cos(phi) * Math.cos(phi);
    const A = Math.cos(phi) * (lam - lam0);

    const M = a * ((1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256) * phi
      - (3*e2/8 + 3*e2*e2/32 + 45*e2*e2*e2/1024) * Math.sin(2*phi)
      + (15*e2*e2/256 + 45*e2*e2*e2/1024) * Math.sin(4*phi)
      - (35*e2*e2*e2/3072) * Math.sin(6*phi));

    let easting  = k0 * N * (A + (1 - T + C) * Math.pow(A,3)/6
      + (5 - 18*T + T*T + 72*C - 58*ep2) * Math.pow(A,5)/120) + 500000.0;

    let northing = k0 * (M + N * Math.tan(phi) * (A*A/2
      + (5 - T + 9*C + 4*C*C) * Math.pow(A,4)/24
      + (61 - 58*T + T*T + 600*C - 330*ep2) * Math.pow(A,6)/720));

    const hemi = (lat >= 0) ? 'N' : 'S';
    if (lat < 0) northing += 10000000.0;

    return { zone, hemi, easting, northing, band: latBandLetter(lat) };
  };
}








	
function utmToLL(E, N, zone, hemi){
  // constants
  const e = Math.sqrt(e2);
  const x = E - 500000.0;
  const y = (hemi === 'S') ? (N - 10000000.0) : N;

  const M  = y / k0;
  const mu = M / (a*(1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256));

  const e1 = (1 - Math.sqrt(1-e2)) / (1 + Math.sqrt(1-e2));
  const J1 = (3*e1/2 - 27*e1*e1*e1/32);
  const J2 = (21*e1*e1/16 - 55*e1*e1*e1*e1/32);
  const J3 = (151*e1*e1*e1/96);
  const J4 = (1097*e1*e1*e1*e1/512);

  const phi1 = mu + J1*Math.sin(2*mu) + J2*Math.sin(4*mu) + J3*Math.sin(6*mu) + J4*Math.sin(8*mu);

  const C1 = ep2 * Math.cos(phi1)*Math.cos(phi1);
  const T1 = Math.tan(phi1)*Math.tan(phi1);
  const N1 = a / Math.sqrt(1 - e2*Math.sin(phi1)*Math.sin(phi1));
  const R1 = a*(1 - e2) / Math.pow(1 - e2*Math.sin(phi1)*Math.sin(phi1), 1.5);
  const D  = x / (N1*k0);

  let lat = phi1 - (N1*Math.tan(phi1)/R1) * (D*D/2 - (5+3*T1+10*C1-4*C1*C1-9*ep2)*Math.pow(D,4)/24 + (61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*Math.pow(D,6)/720);
  let lon = deg2rad((zone-1)*6 - 180 + 3) + (D - (1+2*T1+C1)*Math.pow(D,3)/6 + (5 - 2*C1 + 28*T1 - 3*C1*C1 + 8*ep2 + 24*T1*T1)*Math.pow(D,5)/120) / Math.cos(phi1);

  return { lat: lat*180/Math.PI, lon: lon*180/Math.PI };
}









  // 100k režģa burtu ģenerācija (bez I un O)
  const SET_ORIGIN_COLUMN_LETTERS = ['A','J','S','A','J','S'];
  const SET_ORIGIN_ROW_LETTERS    = ['A','F','A','F','A','F'];

  function get100kSetForZone(zone){ return (zone-1) % 6; }

  function letterAfter(startChar, steps, isRow){
    // rinda: A..V (20 burti), kolonna: A..Z bez I,O
    const skip = ch => (ch==='I' || ch==='O');
    let ch = startChar.charCodeAt(0);
    for(let i=0;i<steps;i++){
      ch++;
      let s = String.fromCharCode(ch);
      if (skip(s)) ch++;
      if (isRow){
        if (ch > 'V'.charCodeAt(0)) ch = 'A'.charCodeAt(0);
      } else {
        if (ch > 'Z'.charCodeAt(0)) ch = 'A'.charCodeAt(0);
      }
    }
    return String.fromCharCode(ch);
  }

  function make100kID(easting, northing, zone){
    const set = get100kSetForZone(zone);
    const eIdx = Math.floor(easting / 100000);            // 1..8
    const nIdx = Math.floor(northing / 100000);           // 0..(∞), mod 20 zemāk

    const colOrigin = SET_ORIGIN_COLUMN_LETTERS[set];     // A / J / S
    const rowOrigin = SET_ORIGIN_ROW_LETTERS[set];        // A / F

    const col = letterAfter(colOrigin, eIdx-1, false);
    const row = letterAfter(rowOrigin, nIdx % 20, true);

    return col + row;
  }

  function pad(n, size){ n = String(n); while(n.length<size) n = '0'+n; return n; }

  // MGRS ar 8 cipariem (10 m)
 function toMGRS8(lat, lon, compact=false){
  const utm  = llToUTM(lat, lon);
  const grid = make100kID(utm.easting, utm.northing, utm.zone);

  const eR = Math.floor(utm.easting  % 100000);     // 0..99999
  const nR = Math.floor(utm.northing % 100000);     // 0..99999

  // 8 cipari = 10 m => 4+4
  const e4 = String(Math.floor(eR/10)).padStart(4,'0');
  const n4 = String(Math.floor(nR/10)).padStart(4,'0');

  const pretty = `${utm.zone}${utm.band} ${grid} ${e4} ${n4}`;
  const tight  = `${utm.zone}${utm.band}${grid}${e4}${n4}`;
  return compact ? tight : pretty;
}







/* ----------------- helpers: drošs tile layer + watchdog ----------------- */
function createSafeTileLayer(url, opts = {}) {
  const defaults = {
    maxZoom: 20,
    maxNativeZoom: opts.maxNativeZoom ?? 19,
    subdomains: 'abc',
    updateWhenIdle: true,
    // mazāk “trokšņa” pie agresīva zoom
    updateWhenZooming: false,
    updateInterval: 150,
    keepBuffer: 3,
    detectRetina: false,        // nepasūta 2× vairāk flīzes
    noWrap: true,               // nerauj ārpus pasaules robežām
    crossOrigin: true,
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
  };
  const layer = L.tileLayer(url, { ...defaults, ...opts });
  // “mīksts” tileerror: aizstāj ar caurspīdīgo un izlaiž
  layer.on('tileerror', (e) => {
    try { e.tile.src = defaults.errorTileUrl; } catch(_) {}
  });
  return layer;
}

function installTileErrorWatch(layer, opts){
  const name      = opts?.name || 'layer';
  const threshold = opts?.threshold || 12;
  const windowMs  = opts?.windowMs  || 3000;
  const onTrip    = opts?.onTrip    || (()=>{});
  let errs = [];
  function purge(){ const t=Date.now(); errs = errs.filter(x => t-x < windowMs); }
  function onErr(){ errs.push(Date.now()); purge(); if (errs.length >= threshold) { layer.off('tileerror', onErr); onTrip(); } }
  layer.on('tileerror', onErr);
  return () => layer.off('tileerror', onErr);
}

















	
  /* ---------------------- KARTES iestatīšana ---------------------- */
  function initMap(){
    if (inited) return true;
    if (!window.L){ console.warn('Leaflet nav ielādēts'); return false; }

  // [A] MAP OPTIONS — pievieno max/min un smalkāku soli
  map = L.map(mapDiv, {
    zoomControl: true,
    attributionControl: true,
    minZoom: 2,                // ADD
    maxZoom: 20,               // ADD (varēsi iezūmot dziļāk par native)
    zoomSnap: 0.25             // ADD (smalkāks zoom solis)
  });
  window.__getMap = () => map;






	  // ===== Base slāņi =====  
 const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap',
    subdomains: 'abc',         // ADD
    maxZoom: 20,               // ADD
    maxNativeZoom: 19,         // KEEP
    updateWhenIdle: true,      // KEEP
    keepBuffer: 2,             // KEEP
    detectRetina: false,       // KEEP
    crossOrigin: true,         // KEEP
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' // ADD (caurspīdīga)
  }).addTo(map);

	  
// REPLACE tikai topo definīciju:
const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
  attribution: 'Map data: © OpenStreetMap, SRTM | Style: © OpenTopoMap (CC-BY-SA)',
  subdomains: 'abc',
  maxZoom: 19,
  maxNativeZoom: 17,
  updateWhenIdle: true,
  keepBuffer: 2,
  detectRetina: false,
  crossOrigin: true,
  errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
});

// ADD: automātiska pārslēgšanās uz OSM, ja OTM birst
let topoErrors = 0;
topo.on('load',      () => { topoErrors = 0; });      // ja ielādējas, skaitītāju nullējam
topo.on('tileerror', () => {
  if (++topoErrors >= 4 && map && map.hasLayer(topo)) {
    console.warn('[layers] OpenTopoMap nav pieejams — pārslēdzos uz OSM');
    map.removeLayer(topo);
    if (!map.hasLayer(osm)) osm.addTo(map);
  }
});

	  
  const esri = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles &copy; Esri',
      subdomains: 'abc',       // ADD (lai {s} strādā vienādi)
      maxZoom: 20,             // ADD
      maxNativeZoom: 19,       // ADD
      detectRetina: false,     // ADD
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' // ADD
    }
  );

	  
  const hot = L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
    attribution: '&copy; OSM, HOT',
    subdomains: 'abc',         // ADD
    maxZoom: 20,               // KEEP
    maxNativeZoom: 19,         // ADD
    detectRetina: false,       // ADD
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' // ADD
  });

	  
  const cyclo = L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
    attribution: '&copy; OSM, CyclOSM',
    subdomains: 'abc',         // ADD
    maxZoom: 20,               // KEEP
    maxNativeZoom: 20,         // ADD (serveris atbalsta līdz 20)
    detectRetina: false,       // ADD
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' // ADD
  });

	  
	// OSM German style (tīrāks stils, labs kā pamats)
  const osmDe = L.tileLayer('https://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors, tiles by openstreetmap.de',
    subdomains: 'abc',         // ADD
    maxZoom: 20,               // ADD
    maxNativeZoom: 19,         // ADD
    detectRetina: false,       // ADD
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' // ADD
  });

	  
	// OSM France (osmfr)
  const osmFr = L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors, tiles by openstreetmap.fr',
    subdomains: 'abc',         // ADD
    maxZoom: 20,               // KEEP
    maxNativeZoom: 20,         // ADD
    detectRetina: false,       // ADD
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' // ADD
  });
	
	// CartoDB Positron (gaišs, “bez trokšņa” — labs kā pamats datu pārklājumiem)
  const cartoLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '© OpenStreetMap contributors, © CARTO',
    subdomains: 'abcd',        // KEEP
    maxZoom: 20,               // KEEP
    maxNativeZoom: 20,         // ADD
    detectRetina: false,       // ADD
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' // ADD
  });

	  
// LVM Topo50 — GWC TMS (ātrāks kešots slānis)
  const lvmTopo50_wms = L.tileLayer.wms('https://lvmgeoserver.lvm.lv/geoserver/ows?', {
    layers: 'public:Topo50',
    format: 'image/png',
    transparent: true,
    tiled: true,               // ADD
    maxZoom: 19                // ADD
    // crs: L.CRS.EPSG3857
  });


  const lvmOSM = L.tileLayer.wms('https://lvmgeoserver.lvm.lv/geoserver/ows?', {
    layers: 'public:OSM',
    format: 'image/png',
    transparent: false,
    tiled: true,               // CHANGE false → true
    maxZoom: 19,               // ADD
    attribution: '© LVM'
  });




	  

	// --- Pārklājumi (overlay) ---
 const hiking = L.tileLayer('https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png', {
    opacity: 0.8,
    maxZoom: 20,               // ADD
    maxNativeZoom: 19,         // ADD
    detectRetina: false,       // ADD
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    attribution: '© waymarkedtrails.org, © OSM līdzstrādnieki'
  });

	  
  const cycling = L.tileLayer('https://tile.waymarkedtrails.org/cycling/{z}/{x}/{y}.png', {
    opacity: 0.8,
    maxZoom: 20,               // ADD
    maxNativeZoom: 19,         // ADD
    detectRetina: false,       // ADD
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    attribution: '© waymarkedtrails.org, © OSM līdzstrādnieki'
  });

	  
  const rail = L.tileLayer('https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', {
    subdomains: 'abc',
    opacity: 0.9,
    attribution: '© OpenRailwayMap, © OSM',
    maxZoom: 20,               // ADD
    maxNativeZoom: 19,         // KEEP
    updateWhenIdle: true,      // KEEP
    keepBuffer: 2,             // KEEP
    detectRetina: false,       // KEEP
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' // KEEP
  });

	  
 const seamarks = L.tileLayer('https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png', {
    opacity: 0.9,
    maxZoom: 20,               // ADD
    maxNativeZoom: 19,         // ADD
    detectRetina: false,       // ADD
    errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    attribution: '© OpenSeaMap, dati © OSM (ODbL)'
  });



	  
    const baseLayers = {
      'OSM': osm,
      'OpenTopoMap': topo,
      'Esri satelīts': esri,
      'OSM HOT': hot,
      'CyclOSM': cyclo,
	  'OSM DE': osmDe,
	  'OSM France': osmFr,	
	  'CartoDB Positron': cartoLight,	
	  'LVM Topo50': lvmTopo50_wms,	
	  'LVM OSM (WMS)': lvmOSM
	};



  // [E] PAPLAŠINI tavu tileerror listeneri uz VISIEM slāņiem
  [
    osm, topo, esri, hot, cyclo, osmDe, osmFr, cartoLight,
    lvmTopo50_wms, lvmOSM,
    hiking, cycling, rail, seamarks
  ].forEach(l => l.on('tileerror', (e) => {
    // nerādīt “salūzušo bildi” + logā redzēt avotu
    try { if (e && e.tile) e.tile.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; } catch(_){}
    console.warn('[tileerror]', l && l._url, e?.coords || e);
  }));






// === Mēroga izvēlne (1:5k..1:100k) ===
const SCALE_OPTIONS = [5000, 10000, 25000, 50000, 75000, 100000];

// palīdzfunkcijas: aktuālais mērogs un nepieciešamais zoom izvēlētam mērogam
function getCurrentScale(){
  const c   = map.getCenter(), z = map.getZoom();
  const mpp = 156543.03392 * Math.cos(c.lat*Math.PI/180) / Math.pow(2, z);
  return Math.round(mpp / 0.0002645833); // “1:xxxx”
}















// ——— Solis pēc kartes mēroga (1:xxxx) ———
// Saskaņots ar drukas realitāti, lai kvadrāti ir ērti nolasāmi.
function gridStepForScale(scale){      // atgriež metrus
  if (scale <=  7500)   return  200;   // 1:5k–1:7.5k → 200 m
  if (scale <= 15000)   return  500;   // 1:10k–1:15k → 500 m
  if (scale <= 30000)   return 1000;   // 1:25k–1:30k → 1 km
  if (scale <= 60000)   return 2000;   // 1:50k–1:60k → 2 km
  if (scale <= 120000)  return 5000;   // 1:75k–1:120k → 5 km
  return 10000;                        // tālāk → 10 km
}

// Mazāko grīdlīniju skaits vienā “lielajā” kvadrātā (UTM smalkajām līnijām)
function gridMinorDivisionsForScale(scale){
  if (scale <=  7500)   return 2;      // 200 m → 100 m starpas
  if (scale <= 15000)   return 2;      // 500 m → 250 m starpas
  if (scale <= 30000)   return 4;      // 1 km → 250 m starpas
  if (scale <= 60000)   return 4;      // 2 km → 500 m starpas
  if (scale <= 120000)  return 5;      // 5 km → 1 km starpas
  return 5;                            // 10 km → 2 km starpas
}













	  
function zoomForScale(scale){
  const lat = map.getCenter().lat * Math.PI/180;
  const mppTarget = scale * 0.0002645833; // m/pixel pie 0.28mm pikseļa
  return Math.log2(156543.03392 * Math.cos(lat) / mppTarget);
}

// pašas kontroles UI
const scalePickCtl = L.control({ position: 'bottomleft' }); 

scalePickCtl.onAdd = function(){
  const wrap = L.DomUtil.create('div', 'leaflet-control-attribution');
  Object.assign(wrap.style, {
    background:'rgba(0,0,0,.5)', color:'#fff', padding:'4px 6px',
    borderRadius:'4px', font:'12px/1.2 system-ui, sans-serif', marginTop:'4px'
  });
  wrap.title = 'Izvēlies mērogu';

  const label = document.createElement('span');
  label.textContent = 'Tīkla mērogs: ';
  label.style.marginRight = '6px';

  const select = document.createElement('select');
  select.id = 'scalePicker';
  Object.assign(select.style, {
    background:'rgba(0,0,0,.3)', color:'#fff',
    border:'1px solid rgba(255,255,255,.2)', borderRadius:'4px',
    padding:'2px 4px', font:'12px/1.2 system-ui, sans-serif'
  });

  SCALE_OPTIONS.forEach(s=>{
    const opt = document.createElement('option');
    opt.value = String(s);
    opt.textContent = '1: ' + s.toLocaleString('lv-LV');
    select.appendChild(opt);
  });

  select.addEventListener('change', ()=>{
    const targetScale = +select.value;
    // atļaujam frakcionētu zoom, lai mērogs sanāk precīzāks
    map.options.zoomSnap = 0;
    map.options.zoomDelta = 0.25;
    map.setZoom( zoomForScale(targetScale), {animate:true} );
    updateRatio();     // atjauno “Mērogs: 1:xxxx” rādītāju
    syncScalePicker(); // pielāgo izvēlnes value, ja vajag
  });


  wrap.appendChild(label);
  wrap.appendChild(select);




  // — Poga: Drukāt (LGIA)
  const lgiaBtn = document.createElement('button');
  lgiaBtn.id = 'lgiaPrintBtn';
  lgiaBtn.type = 'button';
  lgiaBtn.textContent = 'Drukāt (LGIA)';
  Object.assign(lgiaBtn.style, {
    display:'block', marginTop:'8px', width:'100%',
    background:'rgba(0,0,0,.35)', color:'#fff',
    border:'1px solid rgba(255,255,255,.25)', borderRadius:'6px',
    padding:'4px 8px', cursor:'pointer', font:'12px/1.2 system-ui, sans-serif'
  });
  lgiaBtn.addEventListener('click', openLgIaPrintDialog);
  wrap.appendChild(lgiaBtn);














  // — Poga: Sagatavot karti (PDF)
  const printBtn = document.createElement('button');
  printBtn.id = 'preparePrintBtn';
  printBtn.type = 'button';
  printBtn.textContent = 'Sagatavot karti (PDF)';
  Object.assign(printBtn.style, {
    display: 'block',
    marginTop: '8px',
    width: '100%',
    background: 'rgba(0,0,0,.35)',
    color: '#fff',
    border: '1px solid rgba(255,255,255,.25)',
    borderRadius: '6px',
    padding: '4px 8px',
    cursor: 'pointer',
    font: '12px/1.2 system-ui, sans-serif'
  });
  printBtn.addEventListener('click', openLgIaPrintDialog);

  wrap.appendChild(printBtn);





















	

  // neļaujam šai kontrolei “sastrīdēties” ar kartes drag/zoom
  L.DomEvent.disableClickPropagation(wrap);
  L.DomEvent.disableScrollPropagation(wrap);

  // sākumā iestata izvēlnes vērtību tuvākajam mērogam
  setTimeout(()=> syncScalePicker(), 0);
  return wrap;
};
scalePickCtl.addTo(map);

// sinhronizē izvēlnes value ar pašreizējo mērogu (tuvākais no saraksta)
function syncScalePicker(){
  const el = document.getElementById('scalePicker');
  if(!el) return;
  const cur = getCurrentScale();
  let best = SCALE_OPTIONS[0], diff = Infinity;
  SCALE_OPTIONS.forEach(s=>{
    const d = Math.abs(s - cur);
    if(d < diff){ diff = d; best = s; }
  });
  el.value = String(best);
}

// jau esošo rādītāju atjauno + sinhronizē arī izvēlni
map.on('moveend zoomend', ()=>{ updateRatio(); syncScalePicker(); });

























// ===== LGIA stila drukas dialogs + druka =====

// Izveido modālo dialogu ar opcijām (A4/A3, portrets/ainava, mērogs, nosaukums)
function openLgIaPrintDialog(){
  if (document.getElementById('lgiaPrintModal')) return;

  const currentScale = getCurrentScale(); // tava esošā funkcija
  const modal = document.createElement('div');
  modal.id = 'lgiaPrintModal';
  modal.className = 'print-modal';
  modal.innerHTML = `
    <div class="print-modal-card">
      <h3>Drukas iestatījumi (LGIA)</h3>

      <label>Nosaukums (neobligāti)
        <input id="lgiaPrintTitle" type="text" placeholder="Kartes virsraksts">
      </label>

      <div class="row">
        <label>Formāts
          <select id="lgiaPrintFormat">
            <option value="A4">A4</option>
            <option value="A3">A3</option>
          </select>
        </label>
      </div>

    <label>Mērogs
      <select id="lgiaPrintScale">
        ${[5000,10000,25000,50000,75000,100000].map(s=>{
          const sel = (Math.abs(s-currentScale) < 0.5*s/6) ? 'selected' : '';
          return `<option ${sel} value="${s}">1: ${s.toLocaleString('lv-LV')}</option>`;
        }).join('')}
      </select>
    </label>

      <div class="row buttons">
        <button id="lgiaCancel">Atcelt</button>
        <button id="lgiaDoPrint" class="primary">Sagatavot</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#lgiaCancel').addEventListener('click', closeLgIaPrintDialog);
  modal.querySelector('#lgiaDoPrint').addEventListener('click', ()=>{
    const title = modal.querySelector('#lgiaPrintTitle').value.trim();
    const fmt   = modal.querySelector('#lgiaPrintFormat').value;     // 'A4' | 'A3'
    const orient = 'landscape';  //  'landscape'
    const scale = +modal.querySelector('#lgiaPrintScale').value;     // 1:xxxxx
    closeLgIaPrintDialog();
    prepareMapForPrintLgIa({title: title || '', format: fmt, orient, scale});
  });
}

function closeLgIaPrintDialog(){
  const m = document.getElementById('lgiaPrintModal');
  if (m) m.remove();
}

















/* === PRINT aizsargs + gaidīšana līdz flīzes ielādētas === */
/* Aizvieto TAVĀ failā “app (33).js” funkcijā __showPrintGuardOverlay ... */
// ==================== FIX: PRINT aizsargs + progressbar ====================
function __showPrintGuardOverlay(text = 'Gatavojam karti drukai…') {
  let el  = document.getElementById('printGuardOverlay');
  let css = document.getElementById('printGuardOverlayCSS');

  // 1) Iespricējam (vienreiz) CSS ar pareizām alfa vērtībām
  if (!css) {
    css = document.createElement('style');
    css.id = 'printGuardOverlayCSS';
    css.textContent = `
      #printGuardOverlay{position:fixed;inset:0;display:grid;place-items:center;
        background:rgba(0,0,0,.35);color:#fff;z-index:2147483647;
        font:14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
        backdrop-filter:blur(2px)}
      #printGuardOverlay .box{background:rgba(0,0,0,.55);padding:12px 16px;border-radius:12px;
        border:1px solid rgba(255,255,255,.18);min-width:240px;max-width:78vw}
      #printGuardOverlay .title{font-weight:700;margin-bottom:8px}
      #printGuardOverlay .pgo-bar{width:100%;height:8px;border-radius:999px;overflow:hidden;
        background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.12)}
      #printGuardOverlay .pgo-bar > span{display:block;height:100%;width:0%;
        background:linear-gradient(90deg, rgba(255,255,255,.9), rgba(255,255,255,.6))}
      #printGuardOverlay .pgo-sub{margin-top:6px;font-size:12px;opacity:.9}
      @media print{ #printGuardOverlay{ display:none !important } }
    `;
    document.head.appendChild(css);
  }

  // 2) Izveidojam overlay (vienreiz)
  if (!el) {
    el = document.createElement('div');
    el.id = 'printGuardOverlay';
    el.innerHTML = `
      <div class="box">
        <div class="title" id="pgo-title"></div>
        <div class="pgo-bar"><span id="pgo-bar-fill"></span></div>
        <div class="pgo-sub" id="pgo-sub">Sākam ielādi…</div>
      </div>`;
    document.body.appendChild(el);
  }

  // 3) Uzliekam virsrakstu un parādam
  const titleEl = document.getElementById('pgo-title');
  if (titleEl) titleEl.textContent = text;
  el.style.display = 'grid';

  // 4) Progressa API (sauc to no flīžu gaidītāja)
  window.__setPrintProgress = (loaded, total) => {
    const pct = total > 0 ? Math.round((loaded / total) * 100) : 100;
    const bar = document.getElementById('pgo-bar-fill');
    const sub = document.getElementById('pgo-sub');
    if (bar) bar.style.width = pct + '%';
    if (sub) sub.textContent = total > 0
      ? `Ielādētas flīzes: ${loaded}/${total} (${pct}%)`
      : `Ielādētas flīzes: ${loaded} (${pct}%)`;
  };
}

// Atstāj tikai ŠO vienu versiju (izdzēs dublikātu)
function __hidePrintGuardOverlay() {
  const el = document.getElementById('printGuardOverlay');
  if (el) el.style.display = 'none';
  // IMPORTANT: atbrīvojam callback, lai nekas nejauši neziņo pēc drukas
  window.__setPrintProgress = null;
}


/* Gaidām līdz Leaflet flīžu slāņi ir gatavi (vai beidzas timeout) */
/* ================== PATCH #2: robusta gaidīšana ================== */
/* AIZVIETO viso TAVU waitForMapToRender(...) ar šo versiju */
/* ── AIZSTĀJ esošo versiju ── */
function waitForMapToRender(map, opts = {}){
  const timeout = Math.max(1000, +opts.timeout || 12000);
  const settle  = Math.max(0, +opts.settle  || 200);
  const root    = (map && map.getContainer && map.getContainer()) || document.getElementById('onlineMap');

  return new Promise((resolve) => {
    if (!root) return resolve();

    const pending = new Set();
    let total = 0;
    let lastChange = Date.now();
    let rafId = null, toId = null;

    const isMapImg = (n) =>
      n && n.tagName === 'IMG' &&
      (n.classList.contains('leaflet-tile') || n.classList.contains('leaflet-image-layer'));

    function bumpProgress(){
      const loaded = Math.max(0, total - pending.size);
      if (typeof window.__setPrintProgress === 'function') {
        window.__setPrintProgress(loaded, total);
      }
    }

    function arm(img){
      if (!img || pending.has(img)) return;
      // Ja jau gatavs (kešs), neskaitām “pending”
      if (img.complete && img.naturalWidth > 0){ total++; bumpProgress(); return; }
      pending.add(img); total++; lastChange = Date.now();
      img.addEventListener('load',  onDone, { once:true });
      img.addEventListener('error', onDone, { once:true });
      bumpProgress();
    }
    function disarm(img){
      try { img.removeEventListener('load', onDone); } catch(_){}
      try { img.removeEventListener('error', onDone);} catch(_){}
      pending.delete(img); lastChange = Date.now();
      bumpProgress();
    }
    function onDone(e){ disarm(e.currentTarget || e.target); }

    function collectVisible(){
      const rRoot = root.getBoundingClientRect();
      root.querySelectorAll('img.leaflet-tile, img.leaflet-image-layer').forEach(img => {
        const r = img.getBoundingClientRect();
        const vis = (r.right > rRoot.left && r.left < rRoot.right && r.bottom > rRoot.top && r.top < rRoot.bottom);
        if (vis) arm(img);
      });
    }

    const mo = new MutationObserver(muts => {
      let added = false;
      muts.forEach(m => {
        m.addedNodes && m.addedNodes.forEach(n => {
          if (isMapImg(n)) { arm(n); added = true; }
          if (n && n.querySelectorAll) {
            n.querySelectorAll('img.leaflet-tile, img.leaflet-image-layer').forEach(img => { arm(img); added = true; });
          }
        });
      });
      if (added) lastChange = Date.now();
    });
    mo.observe(root, { childList:true, subtree:true });

    const tick = () => {
      // Gatavs, ja nav gaidāmo un kopš pēdējām izmaiņām notecējis “settle”
      if (pending.size === 0 && (Date.now() - lastChange) >= settle) {
        cleanup(); 
        // fināls: 100%
        if (typeof window.__setPrintProgress === 'function') window.__setPrintProgress(total, total);
        resolve();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    function cleanup(){
      if (rafId) cancelAnimationFrame(rafId);
      if (toId) clearTimeout(toId);
      mo.disconnect();
      Array.from(pending).forEach(disarm);
      pending.clear();
    }

    // starta kolekcija + progress
    collectVisible();
    bumpProgress();

    // drošības timeouts
    toId = setTimeout(() => { cleanup(); resolve(); }, timeout);

    // seko kartes kustībām/slāņu maiņām
    if (map && map.on) {
      const kick = () => { lastChange = Date.now(); collectVisible(); };
      map.on('move moveend zoom zoomend layeradd layerremove', kick);
      const _cleanup = cleanup;
      cleanup = function(){
        try { map.off('move', kick).off('moveend', kick).off('zoom', kick).off('zoomend', kick).off('layeradd', kick).off('layerremove', kick); } catch(_){}
        _cleanup();
      };
    }

    tick();
  });
}





// ── Aprēķina rāmja/viewport centru kartes konteinera koordinātēs (px) ──
/* ============================================================
 * 1) AIZVIETO centrēšanas palīgfunkciju (ņem vērā abus sarkanos rāmjus)
 * ============================================================ */
function __centerPxInContainerFromOverlayOrViewport(containerRect){
  // mēģina atrast redzamu overlay un atgriež tā centra koordinātes (ekrāna pikseļos)
  function pickScreenCenterFromOverlays(){
    // a) “PrintMedia overlay tester” (#printAreaOverlay)
    const a = document.getElementById('printAreaOverlay');
    if (a && a.style.display !== 'none' && a.offsetWidth && a.offsetHeight){
      const r = a.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    }
    // b) “Dev” pārklājums (#printDbgOverlay .box)
    const dbg = document.getElementById('printDbgOverlay');
    const box = dbg && dbg.querySelector('.box');
    if (dbg && box && dbg.classList.contains('on') && box.offsetWidth && box.offsetHeight){
      const r = box.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 };
    }
    return null;
  }

  const scr = pickScreenCenterFromOverlays();
  if (scr){
    return { x: scr.x - containerRect.left, y: scr.y - containerRect.top };
  }

  // Fallback — vizuālā viewport centra punkts → kartes konteinera koordinātēs
  const vv = window.visualViewport;
  const cx = (vv ? vv.offsetLeft : 0) + ((vv ? vv.width  : window.innerWidth)  / 2);
  const cy = (vv ? vv.offsetTop  : 0) + ((vv ? vv.height : window.innerHeight) / 2);
  return { x: cx - containerRect.left, y: cy - containerRect.top };
}











/* 1) PALĪGI (ieliec vienreiz, jebkur virs prepareMapForPrintLgIa) */
async function __recenterMapToLL(map, ll){
  // Kāpēc: pēc print-mode mainās #onlineMap izmērs → Leaflet jāzina jaunais izmērs
  map.invalidateSize(true);
  map.setView(ll, map.getZoom(), { animate:false });

  // pikseļu-precīza korekcija uz konteinera ģeometrisko centru
  let pt = map.latLngToContainerPoint(ll);
  let sz = map.getSize();
  map.panBy([ (sz.x/2 - pt.x), (sz.y/2 - pt.y) ], { animate:false });

  // subpikseļi/transformi
  await new Promise(r => requestAnimationFrame(r));
  pt = map.latLngToContainerPoint(ll);
  sz = map.getSize();
  map.panBy([ (sz.x/2 - pt.x), (sz.y/2 - pt.y) ], { animate:false });
}

// ======================= PATCH 1/2: hook ar atvienošanu =======================
function __hookPrintMediaRecenter(map, ll){
  let mq = null;
  let onChange = null;
  let onBefore = null;

  try{
    mq = window.matchMedia('print');
    onChange = (e) => {
      if (e.matches) {
        __recenterMapToLL(map, ll);
        setTimeout(()=>__recenterMapToLL(map, ll), 50);
      }
    };
    // add
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
  }catch(_){}

  onBefore = () => {
    __recenterMapToLL(map, ll);
    setTimeout(()=>__recenterMapToLL(map, ll), 50);
  };
  window.addEventListener('beforeprint', onBefore);

  // ← svarīgi: atgriež atvienotāju
  return function unhook(){
    try{
      if (mq && onChange){
        mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange);
      }
    }catch(_){}
    try{
      if (onBefore) window.removeEventListener('beforeprint', onBefore);
    }catch(_){}
  };
}














	  
// ── GALVENĀ: drukas sagatavošana (līdzsvarotas iekavas, atjaunošana iekš cleanup) ──
async function prepareMapForPrintLgIa(opts){
  const { format, orient, scale, title } = opts;

  // 1) ņemam centru no sarkanā rāmja/viewport
  const rc = map.getContainer().getBoundingClientRect();
  const px = __centerPxInContainerFromOverlayOrViewport(rc);
  const keepCenter = map.containerPointToLatLng(L.point(px.x, px.y));
  const prevView = { center: map.getCenter(), zoom: map.getZoom() };
  // 2) fiksējam animācijas un mērogu
  const prev = {
    zoomSnap: map.options.zoomSnap,
    zoomDelta: map.options.zoomDelta,
    zoomAnim: map.options.zoomAnimation,
    fadeAnim: map.options.fadeAnimation,
    markerZoomAnim: map.options.markerZoomAnimation,
  };
  map.options.zoomSnap = 0;
  map.options.zoomDelta = 0.25;
  map.options.zoomAnimation = false;
  map.options.fadeAnimation = false;
  map.options.markerZoomAnimation = false;
  map.setZoom(zoomForScale(scale), { animate:false });
  if (typeof updateRatio === 'function') updateRatio();

  // 3) iesaldē #onlineMap px izmērus (kāpēc: izvairāmies no layout lēciena)
  const mapEl = document.getElementById('onlineMap');
  const prevInlineStyle = mapEl?.getAttribute('style') || '';
  if (mapEl){
    mapEl.style.width  = mapEl.clientWidth  + 'px';
    mapEl.style.height = mapEl.clientHeight + 'px';
  }

  // 4) ieslēdz print režīmu + @page
  document.body.classList.add('print-mode');
  const styleEl = injectDynamicPrintStyle(format, orient);

  // 5) reflow + sākotnējā centrēšana
  await new Promise(r => requestAnimationFrame(r));
  map.invalidateSize(true);
  map.setView(keepCenter, map.getZoom(), { animate:false });

// → UZREIZ ZEM ŠĪ ANKURA IEVADI:
await __recenterMapToLL(map, keepCenter);     // <-- ADD-A
  const unhookPrint = __hookPrintMediaRecenter(map, keepCenter);   // <-- ADD-B




	
  // 6) uzliekam drukas elementus
  const footer = buildPrintFooterLgIa(scale, title);

  // 7) īstā drukas fāze
  setTimeout(async () => {
    window.addEventListener('afterprint', cleanup, { once:true });

    // saglabā “safe areas” un nullei drukai
    const cs = getComputedStyle(document.documentElement);
    const prevTopSafe    = cs.getPropertyValue('--map-top-safe')    || '0px';
    const prevBottomSafe = cs.getPropertyValue('--map-bottom-safe') || '0px';
    try { window.closeBothSelectorsLegacy && window.closeBothSelectorsLegacy(); } catch(_) {}
    try { closeBothMenus && closeBothMenus(); } catch(_) {}
    document.documentElement.style.setProperty('--map-top-safe', '0px');
    document.documentElement.style.setProperty('--map-bottom-safe', '0px');

    // izslēdz tumšošanu drukai
    const dimEl = document.getElementById('onlineMapDim');
    const prevDimStyle = dimEl ? dimEl.getAttribute('style') : null;
    if (dimEl) dimEl.style.display = 'none';
    let dimCss = document.getElementById('printDimOffCSS');
    if (!dimCss) {
      dimCss = document.createElement('style');
      dimCss.id = 'printDimOffCSS';
      dimCss.textContent = `
        @media print{
          body.print-mode #onlineMapDim{ display:none !important; background:transparent !important; }
          body.print-mode #onlineMap{ filter:none !important; }
        }`;
      document.head.appendChild(dimCss);
    }

   // — 2.1) precīzs “reset” uz keepCenter + ģeometriskā centra pan (1. reize)
map.invalidateSize(true);
if (map._resetView) map._resetView(keepCenter, map.getZoom(), true);
else map.setView(keepCenter, map.getZoom(), { animate:false });

{
  // 2.2) pan uz tiešu konteinera centru (ņem vērā subpikseļus, borderus utt.)
  const sz = map.getSize();
  const onMap = map.latLngToContainerPoint(keepCenter);
  map.panBy([ (sz.x * 0.5 - onMap.x), (sz.y * 0.5 - onMap.y) ], { animate:false });
}

// — 2.3) 1 rAF, lai nofiksētos transforms, tad vēlreiz pan uz tiešu centru (2. reize)
await new Promise(r => requestAnimationFrame(r));
{
  const sz2 = map.getSize();
  const p2  = map.latLngToContainerPoint(keepCenter);
  map.panBy([ (sz2.x * 0.5 - p2.x), (sz2.y * 0.5 - p2.y) ], { animate:false });
}

    // gaidām flīzes, drukājam
    __showPrintGuardOverlay('Gatavojam karti drukai…');
    await waitForMapToRender(map, { timeout: 12000, settle: 200 });
    __hidePrintGuardOverlay();


// → PIRMS window.print(); IEVADI:
await __recenterMapToLL(map, keepCenter);     // <-- ADD-C


	  
    window.print();

   // ==================== CLEANUP: PRECĪZS ATJAUNOJUMS ====================
    function cleanup(){
      // 0) atvieno hook'us (lai nākamreiz nekas neiešaujas nepareizā brīdī)
      try { unhookPrint && unhookPrint(); } catch(_){}

      // 1) izslēdz print režīmu un noņem ģenerēto stilu
      document.body.classList.remove('print-mode');
      try { footer && footer.remove(); } catch(_){}
      try { styleEl && styleEl.remove(); } catch(_){}

      // 2) atjauno tumšošanas pārklājumu
      try {
        const dimCssEl = document.getElementById('printDimOffCSS');
        if (dimCssEl) dimCssEl.remove();
        if (dimEl) {
          if (prevDimStyle !== null) dimEl.setAttribute('style', prevDimStyle);
          else dimEl.removeAttribute('style');
        }
      } catch(_){}

      // 3) atjauno inline width/height, lai kaste atgriežas sākuma izmērā
      try {
        const el = document.getElementById('onlineMap');
        if (el) el.setAttribute('style', prevInlineStyle);
      } catch(_){}

      // 4) atjauno safe-areas un pārskaiti layout
      try {
        document.documentElement.style.setProperty('--map-top-safe',    (prevTopSafe || '0px').trim());
        document.documentElement.style.setProperty('--map-bottom-safe', (prevBottomSafe || '0px').trim());
        window.__updateMapSafeAreas && window.__updateMapSafeAreas();
      } catch(_){}

      // 5) pārzīmē Leaflet un **ATJAUNO sākotnējo centru/zooma līmeni**
      try {
        map.invalidateSize(true);
        map.setView(prevView.center, prevView.zoom, { animate:false });
      } catch(_){}

      // 6) atjauno animāciju iestatījumus
      map.options.zoomSnap = prev.zoomSnap;
      map.options.zoomDelta = prev.zoomDelta;
      map.options.zoomAnimation = prev.zoomAnim;
      map.options.fadeAnimation = prev.fadeAnim;
      map.options.markerZoomAnimation = prev.markerZoomAnim;
    }
  }, 0);
}

// Dinamiski iedod @page size + #onlineMap mm izmēru pēc formāta/orientācijas
// Dinamiski @page + fiksēta kartes pozīcija lapā (bez nobīdēm)
// Dinamiski @page + fiksēta kartes pozīcija lapā (bez nobīdēm)
// + overlay (Title TL, North TR, Scale Top Center, Source BL, Grid BR)
function injectDynamicPrintStyle(fmt, orient){
  // bāzes iekšējie mm (10mm malas katrā pusē)
  const base = (fmt==='A3')
    ? (orient==='portrait' ? {w:277, h:400} : {w:400, h:277})
    : (orient==='portrait' ? {w:190, h:277} : {w:277, h:190});

  // drošības “slack”, lai nebūtu otrā lapa (header/footer situācijās)
  const slackW = (orient==='landscape' ? 2 : 0);
  const slackH = (orient==='landscape' ? 14 : 0);

  const mm = { w: base.w - slackW, h: base.h - slackH };
  const pageSize = (fmt==='A3' ? 'A3' : 'A4') + ' ' + (orient==='portrait' ? 'portrait' : 'landscape');

  const css = `
   @page { size:${pageSize}; margin:0; }
    html, body { margin:0 !important; padding:0 !important; background:#fff !important; }
    @media print {
      html, body { height:auto !important; overflow:hidden !important; }
      #resizeHandle{ display:none !important; }
      body.print-mode > *:not(#canvasContainer):not(#printScaleTop):not(#printTitleTL):not(#printNorthTR):not(#printSourceBL):not(#printGridBR){ display:none !important; }
      body.print-mode #canvasContainer > *:not(#onlineMap){ display:none !important; }
      body.print-mode #onlineMap{
        position: fixed !important;
        inset: 0 !important;
        margin: auto !important;
        width: ${mm.w}mm !important;
        height: ${mm.h}mm !important;
        transform: none !important;
        display: block !important;
        page-break-inside: avoid; break-inside: avoid;
      }
      #onlineMap .leaflet-zoom-anim,
      #onlineMap .leaflet-zoom-animated{
        transition: none !important;
        animation: none !important;
        will-change: auto !important;
      }
    }








      body.print-mode #onlineMap::before{
        content:""; position:absolute; inset:0;
        border:1.2mm solid #000; box-sizing:border-box;
		border: 2px solid #000;  
   		 box-shadow: none !important;
		  pointer-events: none;
		  z-index: 999;
      }

      /* JAUKTĀS KONTROLES – viss Leaflet UI un jebkas “info/coord/scale” tiek noslēpts */
      body.print-mode #onlineMap .leaflet-control,
      body.print-mode #onlineMap .leaflet-top,
      body.print-mode #onlineMap .leaflet-bottom,
      body.print-mode #onlineMap [id*="info"],   body.print-mode #onlineMap [class*="info"],
      body.print-mode #onlineMap [id*="coord"],  body.print-mode #onlineMap [class*="coord"],
      body.print-mode #onlineMap [id*="koord"],  body.print-mode #onlineMap [class*="koord"],
      body.print-mode #onlineMap [id*="scale"],  body.print-mode #onlineMap [class*="scale"]{
        display:none !important;
      }

      /* TOP – mērogs centrā, mazliet augstāk no rāmja */
      body.print-mode #printScaleTop,
      body.print-mode #printScaleTop *{ visibility:visible !important; }
      body.print-mode #printScaleTop{
        position:fixed !important;
        top:6mm !important; left:50% !important; transform:translateX(-50%) !important;
        font:11pt/1.1 system-ui, sans-serif; color:#000; text-align:center;
      }

      /* TOP-LEFT – virsraksts */
      body.print-mode #printTitleTL{ 
        position:fixed !important; top:6mm !important; left:10mm !important;
        font:12pt/1.2 system-ui, sans-serif; font-weight:600; color:#000;
        max-width:${mm.w/2}mm; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        visibility:visible !important;
      }

/* TOP-RIGHT — ziemeļu bulta (tīra, bez svešiem elementiem) */
body.print-mode #printNorthTR,
body.print-mode #printNorthTR *{ visibility: visible !important; }

body.print-mode #printNorthTR{
  position: fixed !important;
  top: 6mm !important; right: 10mm !important;
  display: flex; align-items: center; gap: 2mm;
  z-index: 2147483647;
  background: none !important; background-image: none !important;
  box-shadow: none !important; border: 0 !important; outline: 0 !important;
  filter: none !important; mix-blend-mode: normal !important;
  font-size: 0; user-select: none; pointer-events: none;
  isolation: isolate;                    /* ← JAUNS */
}

/* jau bija: paša konteinera pseudo-elementi */
body.print-mode #printNorthTR::before,
body.print-mode #printNorthTR::after{ content: none !important; display: none !important; }

/* JAUNS: izslēdz pseudo-elementus VISIEM bērniem */
body.print-mode #printNorthTR *::before,
body.print-mode #printNorthTR *::after{ content: none !important; display: none !important; }

/* JAUNS: ja kaut kur iemantojas svg/img/canvas – slēdz ārā */
body.print-mode #printNorthTR img,
body.print-mode #printNorthTR svg,
body.print-mode #printNorthTR canvas{ display: none !important; }

/* pašas bultas ģeometrija un “N” */
body.print-mode #printNorthTR .northArrow{
  width:0; height:0; margin:0;
  border-left:4mm solid transparent;
  border-right:4mm solid transparent;
  border-bottom:8mm solid #000;
margin-top: 1mm;
}
body.print-mode #printNorthTR .n{
  font:9pt/1 system-ui, sans-serif; font-weight:700; letter-spacing:1px; color:#000;
  pointer-events:none;
}






      /* BOTTOM-LEFT – avots */
      body.print-mode #printSourceBL{
        position:fixed !important; left:10mm !important; bottom:6mm !important;
        font:10pt/1.2 system-ui, sans-serif; color:#000; visibility:visible !important;
        max-width:${mm.w/1.5}mm; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }

      /* BOTTOM-RIGHT – režģa tips (UTM/LKS) */
      body.print-mode #printGridBR{
        position:fixed !important; right:10mm !important; bottom:6mm !important;
        font:10pt/1.2 system-ui, sans-serif; color:#000; visibility:visible !important;
        white-space:nowrap;
      }


   
    }
  `;
  let el = document.getElementById('dynamicPrintStyle');
  if (!el){ el = document.createElement('style'); el.id = 'dynamicPrintStyle'; document.head.appendChild(el); }
  el.textContent = css;
  return el;
}




// Drukas pēda: [Nosaukums] [Mērogs] [Atsauces kartēm] [CADET.LV]
// Uzraksti drukai: Title (TL), North (TR), Scale (Top-Center), Source (BL), Grid (BR)
function buildPrintFooterLgIa(scaleVal, title){
  const elv = (n)=> (''+n).replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  const mapAttrib  = collectAttributionText() || 'Dati: kartes pakalpojums';
  const toolAttrib = '© CADET.LV Interaktīvais kompass — janiseglis.github.io/virtual-compass';
  const gridText   = getActiveGridLabel(); // UTM vai LKS (skat. funkciju zemāk)

  const els = [];

  // Mērogs augšā centrā
  const scaleTop = document.createElement('div');
  scaleTop.id = 'printScaleTop';
  scaleTop.textContent = 'Mērogs: 1:' + elv(scaleVal);
  document.body.appendChild(scaleTop); els.push(scaleTop);

  // Virsraksts (TL) – ja tukšs, neko neliekam
  if (title){
    const tl = document.createElement('div');
    tl.id = 'printTitleTL';
    tl.textContent = title;
    document.body.appendChild(tl); els.push(tl);
  }

  // Ziemeļu bulta (TR)
  const tr = document.createElement('div');
  tr.id = 'printNorthTR';
  tr.innerHTML = `<div class="northArrow"></div><div class="n">N</div>`;
  document.body.appendChild(tr); els.push(tr);

  // Avots (BL)
  const bl = document.createElement('div');
  bl.id = 'printSourceBL';
  bl.textContent = `Avots: ${mapAttrib} · ${toolAttrib}`;
  document.body.appendChild(bl); els.push(bl);

  // Režģis (BR)
  const br = document.createElement('div');
  br.id = 'printGridBR';
  br.textContent = gridText;
  document.body.appendChild(br); els.push(br);

  // noderīgi cleanup
  window.__printOverlayEls = els;
  return br; // nav būtiski, galvenais – ir atsauce cleanupam
}

// Atpazīst aktīvo režģi (UTM vai LKS), skat. globālās references uz grid slāņiem.
function getActiveGridLabel(){
  try{
    if (window.lksGrid && map.hasLayer(window.lksGrid)) return 'Režģis: LKS-92';
    if (window.lksLabels && map.hasLayer(window.lksLabels)) return 'Režģis: LKS-92';
    if (window.utmGrid && map.hasLayer(window.utmGrid)) return 'Režģis: UTM/MGRS';
    if (window.utmLabels && map.hasLayer(window.utmLabels)) return 'Režģis: UTM/MGRS';
  }catch(e){}
  return 'Režģis: nav';
}



// Palīgs – savācam redzamo avotu atsauces
function collectAttributionText(){
  const n = document.querySelector('#onlineMap .leaflet-control-container .leaflet-bottom.leaflet-right .leaflet-control-attribution');
  if (n && n.textContent) return n.textContent.trim();
  let atts = new Set();
  map.eachLayer(l=>{
    const a = (typeof l.getAttribution === 'function') ? l.getAttribution() : (l.options && l.options.attribution);
    if (a) atts.add(a.replace(/\s+/g,' ').trim());
  });
  return Array.from(atts).join(' · ');
}





















	  



	  

// === MGRS/UTM režģis sadalīts 2 slāņos: LĪNIJAS un ETIĶETES ===
function createUTMGridLayers(){
  const gLines  = L.layerGroup();   // līnijas
  const gLabels = L.layerGroup();   // etiķetes












	









	

  // Pane līnijām
  if (!map.getPane('gridPane')){
    map.createPane('gridPane');
    const p = map.getPane('gridPane');
    p.style.zIndex = 490;
    p.style.pointerEvents = 'none';
  }
  // Pane etiķetēm (virs līnijām)
  if (!map.getPane('gridLabelPane')){
    map.createPane('gridLabelPane');
    const p = map.getPane('gridLabelPane');
    p.style.zIndex = 491;
    p.style.pointerEvents = 'none';
  }

  // CSS etiķetēm – kā iepriekš
  if (!document.getElementById('utm-grid-css')){
    const el = document.createElement('style');
    el.id = 'utm-grid-css';
    el.textContent = `
      .utm-label span{
        display:inline-block; background:rgba(0,0,0,.55); color:#fff;
        padding:2px 6px; border-radius:6px; font:12px/1.25 system-ui;
        text-shadow:0 1px 0 #000, 0 0 3px #000; white-space:nowrap; user-select:none;
      }
      .utm-label.major span{ font-weight:700; }
    `;
    document.head.appendChild(el);
  }

// stili — melns, izteikts
const GRID_COLOR    = '#000000';   // ← melns
const OUTLINE_COLOR = '#ffffff';   // balts “halo”, lai līnijas labi redzamas uz satelīta

// Mazās (starplīnijas) — nedaudz biezākas, ar pārtraukumiem
const MINOR     = { pane:'gridPane', color: GRID_COLOR,  opacity: 1.0, weight: 2.6,
                    lineJoin:'round', lineCap:'round' };
const MINOR_OUT = { pane:'gridPane', color: OUTLINE_COLOR, opacity: .92,
                    weight: MINOR.weight + 2.2, lineJoin:'round', lineCap:'round' };

// Lielās (galvenās) — biezas, nepārtrauktas
const MAJOR     = { pane:'gridPane', color: GRID_COLOR,  opacity: 1.0, weight: 3.8,
                    lineJoin:'round', lineCap:'round' };
const MAJOR_OUT = { pane:'gridPane', color: OUTLINE_COLOR, opacity: .94,
                    weight: MAJOR.weight + 2.6, lineJoin:'round', lineCap:'round' };






function addLine(points, isMajor, putLabel, labelLatLng, labelText){
  const thin = document.body.classList.contains('print-mode');
  const wMinor = thin ? 0.5 : 2.6;
  const wMajor = thin ? 0.9 : 3.8;
  const minorOut = thin ? wMinor + 0.6 : wMinor + 2.2;
  const majorOut = thin ? wMajor + 0.8 : wMajor + 2.6;

  L.polyline(points, {pane:'gridPane', color:'#ffffff', opacity:thin?.9:.92,
                      weight: isMajor ? majorOut : minorOut, lineJoin:'round', lineCap:'round'}).addTo(gLines);
  L.polyline(points, {pane:'gridPane', color:'#000000', opacity:1.0,
                      weight: isMajor ? wMajor : wMinor, lineJoin:'round', lineCap:'round'}).addTo(gLines);

  if (putLabel && labelLatLng){
    const icon = L.divIcon({ className: 'utm-label' + (isMajor ? ' major' : ''),
      html: `<span>${labelText}</span>`, iconSize:[0,0], iconAnchor:[0,0] });
    L.marker(labelLatLng, { icon, pane:'gridLabelPane', interactive:false }).addTo(gLabels);
  }
}











	

function redraw(){
  if (!map || !map._loaded) return;

  gLines.clearLayers();
  gLabels.clearLayers();

  const z  = map.getZoom();
  const scale = getCurrentScale();
const step  = gridStepForScale(scale);
const divs  = gridMinorDivisionsForScale(scale);


  const b  = map.getBounds();
  const nw = b.getNorthWest(), se = b.getSouthEast();

  // Vienmēr skaitām vienas (centra) UTM zonas koordinātēs
  const c   = map.getCenter();
  const z0  = utmZoneSpecial(c.lat, c.lng, utmZone(c.lng));
  const hemi = (c.lat >= 0) ? 'N' : 'S';

  // Stūrus pārmetam uz šo pašu zonu
  const nwU = window.llToUTMInZone(nw.lat, nw.lng, z0);
  const seU = window.llToUTMInZone(se.lat, se.lng, z0);

  const minE = Math.floor(Math.min(nwU.easting,  seU.easting)  / step) * step;
  const maxE = Math.ceil (Math.max(nwU.easting,  seU.easting)  / step) * step;
  const minN = Math.floor(Math.min(nwU.northing, seU.northing) / step) * step;
  const maxN = Math.ceil (Math.max(nwU.northing, seU.northing) / step) * step;

  const labelZoom = true; // etiķetes vienmēr redzamas

  const midN = (minN + maxN) / 2;
  const midE = (minE + maxE) / 2;



  // Easting līnijas
  for (let E = minE; E <= maxE; E += step){
    const pts = [];
for (let N = minN; N <= maxN; N += step/divs){
      const ll = utmToLL(E, N, z0, hemi);
      pts.push([ll.lat, ll.lon]);
    }
    const isMajor = (E % 10000) === 0;
    const labLL = utmToLL(E, midN, z0, hemi);
    addLine(pts, isMajor, labelZoom, [labLL.lat, labLL.lon], 'E ' + Math.round(E/1000) + ' km');
  }

  // Northing līnijas
  for (let N = minN; N <= maxN; N += step){
    const pts = [];
for (let E = minE; E <= maxE; E += step/divs){
      const ll = utmToLL(E, N, z0, hemi);
      pts.push([ll.lat, ll.lon]);
    }
    const isMajor = (N % 10000) === 0;
    const labLL = utmToLL(midE, N, z0, hemi);
    addLine(pts, isMajor, labelZoom, [labLL.lat, labLL.lon], 'N ' + Math.round(N/1000) + ' km');
  }
}
  map.on('moveend zoomend resize viewreset', redraw);

  setTimeout(redraw, 0);

  // atgriežam abus atsevišķus slāņus
  return { grid: gLines, labels: gLabels };
}
 
   // jaunais – pievienojam MGRS/UTM režģi kā pārklājumu
// vispirms iedod centru/zoom:
map.setView([56.9496, 24.1052], 13);

















// ====== LKS-92 režģa ģenerators ======
function createLKSGridLayers(){
 const lineStyle = { color:'#000000', weight:2.6, opacity:0.95 }; // melnas, izteiktas līnijas

  const labelStyle = {className:'lks-grid-label'};               // CSS vari piekrāsot, ja vajag

  const grid = L.layerGroup();
  const labels = L.layerGroup();

  // ņem redzamo kartes rāmi un taisa 1 km režģi
function redraw(){
  grid.clearLayers(); labels.clearLayers();
  const thin = document.body.classList.contains('print-mode');
  const lineStyle = { color:'#000000', weight: thin ? 0.6 : 2.6, opacity: 0.95 };

    const b = map.getBounds();
  const scale = getCurrentScale();
const step  = gridStepForScale(scale);

    // pārveido robežas uz LKS, lai iterētu E/N
    const bl = wgsToLKS(b.getSouth(), b.getWest());
    const tr = wgsToLKS(b.getNorth(), b.getEast());

    const E_min = Math.floor(bl.E/step)*step;
    const N_min = Math.floor(bl.N/step)*step;
    const E_max = Math.ceil(tr.E/step)*step;
    const N_max = Math.ceil(tr.N/step)*step;

    // Palīgfunkcija: LKS punktu rindu pārveido uz LatLng polilīniju
    const toLatLngs = (pointsEN) => pointsEN.map(p=>{
      // “atpakaļ” uz WGS84 — ja Tev ir lksToWgs, izmanto to.
      // Šeit izmantojam proj4 jau definēto transformāciju (ja Tev tāda ir):
      const xy = proj4('EPSG:3059','EPSG:4326',[p.E,p.N]);  // [lng,lat]
      return L.latLng(xy[1], xy[0]);
    });

    // Vertikālās (E konst) līnijas
    for (let E=E_min; E<=E_max; E+=step){
      const pts = [
        {E, N:N_min},
        {E, N:N_max}
      ];
      L.polyline(toLatLngs(pts), lineStyle).addTo(grid);
      // etiķete augšā
      const top = toLatLngs([{E, N:N_max}])[0];
      L.marker(top, {icon:L.divIcon({...labelStyle, html:`E ${E}` }), interactive:false}).addTo(labels);
    }

    // Horizontālās (N konst) līnijas
    for (let N=N_min; N<=N_max; N+=step){
      const pts = [
        {E:E_min, N},
        {E:E_max, N}
      ];
      L.polyline(toLatLngs(pts), lineStyle).addTo(grid);
      // etiķete pa kreisi
      const left = toLatLngs([{E:E_min, N}])[0];
      L.marker(left, {icon:L.divIcon({...labelStyle, html:`N ${N}` }), interactive:false}).addTo(labels);
    }
  }

  map.on('moveend zoomend resize viewreset', redraw);

  redraw();

  return {grid, labels};
}





























	  

// režģi un slāņu kontroli veido tikai tad, kad karte tiešām “gatava”
map.whenReady(() => {


// LL → UTM piespiedu zonā (izmantojam centra zonu, lai režģis nepazūd)
function llToUTMInZone(lat, lon, zone){
  const phi  = deg2rad(lat);
  const lam  = deg2rad(lon);
  const lam0 = deg2rad((zone - 1)*6 - 180 + 3);

  const N = a / Math.sqrt(1 - e2*Math.sin(phi)*Math.sin(phi));
  const T = Math.tan(phi)*Math.tan(phi);
  const C = ep2 * Math.cos(phi)*Math.cos(phi);
  const A = Math.cos(phi) * (lam - lam0);

  const M = a*((1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256)*phi
         - (3*e2/8 + 3*e2*e2/32 + 45*e2*e2*e2/1024)*Math.sin(2*phi)
         + (15*e2*e2/256 + 45*e2*e2*e2/1024)*Math.sin(4*phi)
         - (35*e2*e2*e2/3072)*Math.sin(6*phi));

  let easting  = k0 * N * (A + (1-T+C)*Math.pow(A,3)/6 + (5-18*T+T*T+72*C-58*ep2)*Math.pow(A,5)/120) + 500000.0;
  let northing = k0 * (M + N*Math.tan(phi)*(A*A/2 + (5-T+9*C+4*C*C)*Math.pow(A,4)/24 + (61-58*T+T*T+600*C-330*ep2)*Math.pow(A,6)/720));

  const hemi = (lat >= 0) ? 'N' : 'S';
  if (lat < 0) northing += 10000000.0;

  return { zone, hemi, easting, northing, band: latBandLetter(lat) };
}


















	




















	





	
// --- Režģu slāņi (izsaucam vienreiz) ---
const { grid: utmGrid, labels: utmLabels } = createUTMGridLayers();
const { grid: lksGrid, labels: lksLabels } = createLKSGridLayers();
Object.assign(window, { utmGrid, utmLabels, lksGrid, lksLabels });	

// ieliekam katru atsevišķi kā pārklājumu
const overlays = {
  'MGRS režģa līnijas (1–20 km)': utmGrid,
  'MGRS etiķetes': utmLabels,
'LKS-92 režģa līnijas (1–20 km)': lksGrid,
'LKS-92 etiķetes': lksLabels,

  // JAUNI pārklājumi:
  'Pārgājienu takas (Waymarked)': hiking,
  'Velomaršruti (Waymarked)': cycling,
  'Dzelzceļš (OpenRailwayMap)': rail,
  'Jūras zīmes (OpenSeaMap)': seamarks,

};










	
  const layersCtl = L.control.layers(baseLayers, overlays, {
    collapsed: true,
    position: 'topright'
  }).addTo(map);

// Ja ieslēdz/izslēdz režģus – nosakām, ko rādīt popupā.
// Noteikums: "pēdējais ieslēgtais režģis" nosaka režīmu.
//map.on('overlayadd',  (e)=>{
//  if (e.layer === lksGrid || e.layer === lksLabels)  coordMode = 'LKS';
//  if (e.layer === utmGrid || e.layer === utmLabels)  coordMode = 'MGRS';
//  localStorage.setItem('coordMode', coordMode);
//});
//map.on('overlayremove', (e)=>{
  // Ja izslēdz LKS un paliek UTM – pārslēdzam uz MGRS (un otrādi)
  // (izvēlies sev vēlamo loģiku; zemāk: ja LKS izslēdz, krītam uz MGRS)
//  if (e.layer === lksGrid || e.layer === lksLabels)  { coordMode = 'MGRS'; }
//  if (e.layer === utmGrid || e.layer === utmLabels)  { coordMode = 'LKS';  }
//  localStorage.setItem('coordMode', coordMode);
//});


	
// ja vēlies — MGRS ieslēgts pēc noklusējuma:
//  utmGrid.addTo(map); utmLabels.addTo(map);
// LKS atstāj izslēgtu (vai ieslēdz arī to, ja gribi):
// lksGrid.addTo(map); lksLabels.addTo(map);


  // ▶ Slāņu panelis: atveras ar klikšķi, aizveras pēc izvēles
  makeLayersClickOnly(layersCtl);


// 👇 Pievieno šo 2 rindiņas
window.__layersCtl = layersCtl;                             // (pēc vajadzības: lai var piekļūt no konsoles)
window.__probeLayers && window.__probeLayers(layersCtl);    // ← te notiek piesiešana
});













// ===== Palīgi LGIA scale baram =====
function metersPerPixelAtCenter(){
  const c = map.getCenter();
  const z = map.getZoom();
  return 156543.03392 * Math.cos(c.lat * Math.PI/180) / Math.pow(2, z);
}
function currentPrintScale(){ // “1:xxxx” pie 0.28 mm/pix
  return Math.round(metersPerPixelAtCenter() / 0.00028);
}

// ===== LGIA-style lineārā mēroga josla =====
const LgiaScale = L.Control.extend({
  options: {
    position: 'bottomleft',
    maxWidthPx: 140,                        // max joslas garums pikseļos
    niceStepsMeters: [5,10,20,50,100,200,500,1000,2000,5000,10000]
  },
onAdd: function(){
  const container = L.DomUtil.create('div', 'lgia-scale');

  // 1) Teksts augšā
  const label = L.DomUtil.create('div', 'lgia-scale-label', container);

  // 2) Josla zem teksta (apgriezta otrādi)
  const bar = L.DomUtil.create('div', 'lgia-scale-bar', container);
  const left = document.createElement('div');
  const right = document.createElement('div');
  bar.appendChild(left);
  bar.appendChild(right);

  // — Stili —
  Object.assign(container.style, {
    padding:'2px 6px',
    background:'rgba(0,0,0,.5)',
    borderRadius:'4px',
    border:'1px solid rgba(255,255,255,.06)',
    color:'#fff',
    font:'12px/1.2 system-ui, sans-serif',
    display:'inline-flex',
    flexDirection:'column',
    alignItems:'center',   // centrējam label + joslu
    gap:'2px'
  });

  Object.assign(label.style, { textAlign:'center' });

  Object.assign(bar.style, {
    height:'0px',
    borderTop:'3px solid #fff',   // galvenā līnija
    position:'relative',
    width:'80px',
    margin:'2px auto 0',
    transform:'rotate(180deg)',   // apgriež joslu otrādi (stabiņi uz leju)
    transformOrigin:'50% 50%'
  });

  Object.assign(left.style,  {
    position:'absolute', left:'0', top:'-3px',
    height:'10px', borderLeft:'3px solid #fff'
  });
  Object.assign(right.style, {
    position:'absolute', right:'0', top:'-3px',
    height:'10px', borderRight:'3px solid #fff'
  });

  this._els = { bar, label };
  this._update = this._update.bind(this);
  map.on('move zoom zoomend', this._update);
  this._update();

  L.DomEvent.disableClickPropagation(container);
  L.DomEvent.disableScrollPropagation(container);
  return container;
},
  onRemove: function(){ map.off('move zoom zoomend', this._update); },
  _update: function(){
    const mpp = metersPerPixelAtCenter();
    const scale = currentPrintScale();

    // LGIA uzvedība: pie apm. 1:5000 rādām 100 m
    let targetMeters;
    if (scale >= 4500 && scale <= 5500) {
      targetMeters = 100;
    } else {
      const maxMeters = mpp * this.options.maxWidthPx;
      const steps = this.options.niceStepsMeters;
      targetMeters = steps[0];
      for (let s of steps) { if (s <= maxMeters) targetMeters = s; else break; }
      if (maxMeters < steps[0]) targetMeters = steps[0];
    }

    const px = targetMeters / mpp;
    this._els.bar.style.width = px + 'px';
    this._els.label.textContent = (targetMeters >= 1000)
      ? (targetMeters % 1000 ? (targetMeters/1000).toFixed(1) : (targetMeters/1000)) + ' km'
      : targetMeters + ' m';
  }
});

// Pievieno LGIA joslu
new LgiaScale({ position:'bottomleft' }).addTo(map);























	  
    const ratioCtl = L.control({position:'bottomleft'});
    ratioCtl.onAdd = function(){
      const div = L.DomUtil.create('div', 'leaflet-control-attribution');
      Object.assign(div.style, {
        background:'rgba(0,0,0,.5)', color:'#fff', padding:'2px 6px',
        borderRadius:'4px', font:'12px/1.2 system-ui, sans-serif', marginTop:'4px'
      });
      div.id = 'scaleRatioCtl';
      div.textContent = 'Mērogs: —';
      return div;
    };
    ratioCtl.addTo(map);

    function updateRatio(){
      const c = map.getCenter(), z = map.getZoom();
      const mpp = 156543.03392 * Math.cos(c.lat*Math.PI/180) / Math.pow(2,z);
      const scale = Math.round(mpp / 0.00028);
      const el = document.getElementById('scaleRatioCtl');
      if (el) el.textContent = 'Tīkla mērogs: 1:' + scale.toLocaleString('lv-LV');
    }
    map.on('moveend zoomend', updateRatio); updateRatio();

    // apakšējais kreisais info (Lat/Lng + MGRS) + klikšķis — kopēt
    const posCtl = L.control({position:'bottomleft'});
    posCtl.onAdd = function(){
      const div = L.DomUtil.create('div', 'leaflet-control-attribution');
      Object.assign(div.style, {
        background:'rgba(0,0,0,.5)', color:'#fff', padding:'2px 6px',
        borderRadius:'4px', font:'12px/1.2 system-ui, sans-serif', marginTop:'4px', cursor:'pointer'
      });
      div.id = 'mousePosCtl';
      div.title = 'Noklikšķini, lai kopētu MGRS';
      div.textContent = 'Lat,Lng: —';
      div.addEventListener('click', async () => {
  const v = div.dataset.mgrs || '';
  if (!v) return;

  let ok = false;
  try {
    // primārā metode – darbojas drošā (https) kontekstā
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(v);
      ok = true;
    } else {
      // rezerves variants – textarea + execCommand
      const ta = document.createElement('textarea');
      ta.value = v;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    }
  } catch(e){ ok = false; }

  if (ok) {
    // īss vizuāls “flash”, netraucē tekstam, ko mousemove pārtaisa
    const oldBG = div.style.background;
    div.style.background = 'rgba(31,122,54,.65)'; // zaļš
    setTimeout(() => { div.style.background = oldBG || 'rgba(0,0,0,.5)'; }, 1200);
  } else {
    alert('Neizdevās nokopēt. Lūdzu, mēģini vēlreiz.');
  }
});
      return div;
    };
    posCtl.addTo(map);

    map.on('mousemove', e=>{
      const lat = e.latlng.lat, lon = e.latlng.lng;
      const mgrs = toMGRS8(lat, lon);
      const s = `${lat.toFixed(6)}, ${lon.toFixed(6)}  |  ${mgrs}`;
      const el = document.getElementById('mousePosCtl');
      if (el){ el.textContent = s; el.dataset.mgrs = mgrs; }
    });









function makeLayersClickOnly(layersCtl){
  if (!layersCtl) return;
  const c = layersCtl._container;
  if (!c) { requestAnimationFrame(() => makeLayersClickOnly(layersCtl)); return; }

  const isOpen = () => L.DomUtil.hasClass(c,'leaflet-control-layers-expanded');
  const open   = () => (layersCtl.expand||layersCtl._expand).call(layersCtl);
  const close  = () => (layersCtl.collapse||layersCtl._collapse).call(layersCtl);

  // noņem hover uzvedību
  L.DomEvent.off(c,'mouseover');
  L.DomEvent.off(c,'mouseout');

  // ─── Ghost-click aizsargs (pēc atvēršanas) ───
  let suppressUntil = 0;
  const SUPPRESS_MS = 360;
  // CAPTURE klausītājs, lai apturētu pirmo klikšķi panelī
  c.addEventListener('click', (e) => {
    if ((performance.now ? performance.now() : Date.now()) < suppressUntil) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  function bindToggle(){
    const link = layersCtl._layersLink || c.querySelector('.leaflet-control-layers-toggle');
    if (!link || link.__bound) return;
    link.__bound = true;

    // svarīgi skārienam
    link.style.touchAction = 'none';

    const onToggle = (e) => {
      // NEĻAUJAM pārlūkam ģenerēt papildu klikšķus
      e.preventDefault();
      e.stopPropagation();

      if (isOpen()) {
        close();
      } else {
        open();
        // bloķē pirmo klikšķi panelī, lai spoku klikšķis neuzsit pa label/input
        const now = (performance.now ? performance.now() : Date.now());
        suppressUntil = now + SUPPRESS_MS;
      }
    };

    const supportsPointer = !!window.PointerEvent && ('onpointerdown' in window);

    // notīrām iepriekšējās saites (ja bija)
    ['click','touchstart','pointerdown','mousedown'].forEach(ev => {
      try{ link.removeEventListener(ev, onToggle, false); }catch(_){}
    });

    if (supportsPointer) {
      link.addEventListener('pointerdown', onToggle, {passive:false});
    } else if ('ontouchstart' in window) {
      link.addEventListener('touchstart', onToggle, {passive:false});
      link.addEventListener('mousedown',   onToggle, {passive:false}); // rezerve
    } else {
      link.addEventListener('mousedown',   onToggle, {passive:false});
    }
  }
  bindToggle();
  new MutationObserver(bindToggle).observe(c, {childList:true, subtree:true});

  // ─── Aizveram pēc izvēles, bet ne uzreiz ghost-click laikā ───
  function wireInputs(){
    const form = c.querySelector('.leaflet-control-layers-list') || c;
    form.querySelectorAll('input[type=radio],input[type=checkbox]').forEach(inp=>{
      if (inp.__bound) return;
      inp.__bound = true;
      inp.addEventListener('change', (ev) => {
        const now = (performance.now ? performance.now() : Date.now());
        if (now < suppressUntil) return;   // ignorē ghost-click logu
        setTimeout(close, 80);
      }, false);
    });
  }
  wireInputs();
  new MutationObserver(wireInputs).observe(c, {childList:true, subtree:true});

  // neļaujam notikumiem iziet uz karti
  L.DomEvent.disableClickPropagation(c);
  L.DomEvent.disableScrollPropagation(c);
}














map.whenReady(() => {
  (function addInfoHandle() {
    const stack = document.querySelector('#onlineMap .leaflet-control-container .leaflet-bottom.leaflet-left');
    if (!stack) return;

    let btn = stack.querySelector('.info-handle');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'info-handle';
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('title', 'Parādīt/slēpt info paneli');
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      stack.appendChild(btn);
    }

    // neļaujam kartes pannam “apēst” notikumus
    if (window.L && L.DomEvent) {
      L.DomEvent.disableClickPropagation(btn);
      L.DomEvent.disableScrollPropagation(btn);
      L.DomEvent.on(btn, 'mousedown dblclick pointerdown touchstart', L.DomEvent.stop);
      L.DomEvent.on(btn, 'contextmenu', L.DomEvent.stop);
    }

    const toggle = (ev) => {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      stack.classList.toggle('info-collapsed');
      const expanded = !stack.classList.contains('info-collapsed');
      btn.setAttribute('aria-expanded', String(expanded));
      btn.classList.toggle('collapsed', !expanded);
    };

    // ── PIESAISTE AR PAREIZU FILTRU ─────────────────────────────
    const supportsPointer = 'onpointerup' in window;

    if (supportsPointer) {
      btn.addEventListener('pointerup', (e) => {
        // tikai primārā (kreisā) poga ar peli; uz touch/pen – vienmēr OK
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        toggle(e);
      }, { passive: false });

      // NEPIESIENAM 'click', lai nebūtu dubult-toggles uz kreisās peles
    } else {
      // vecākiem iOS/UC u.c. – touch + click kā rezerve
      btn.addEventListener('touchend', toggle, { passive: false });
      btn.addEventListener('click', toggle, { passive: false });
    }

    // Tastatūras piekļūstamība
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); }
    });


  })();
});










	  
 // Viena palīgfunkcija popupam – atdod, ko rādīt 2. rindā
// === Ko rādīt popupā (Lat/Lng + UTM/MGRS + LKS-92 atkarībā no redzamajiem slāņiem) ===
function rowsForPopup(lat, lng){
  // droši paņemam karti
  const m = (typeof window.__getMap === 'function') ? window.__getMap() : (typeof map !== 'undefined' ? map : null);

  // helperis: pārbauda, vai slānis ir kartē
  const has = L => !!(m && L && typeof m.hasLayer === 'function' && m.hasLayer(L));

  // UTM/MGRS un LKS-92 ieslēgts, ja kartē ir LĪNIJAS vai ETIĶETES
  const utmOn = has(window.utmGrid) || has(window.utmLabels) || has(window.utmgrid) || has(window.utmlabels);
  const lksOn = has(window.lksGrid) || has(window.lksLabels) || has(window.lksgrid) || has(window.lkslabels);

  const rows = [];

  // vienmēr – Lat,Lng
  rows.push({
    id: 'wgs',
    label: 'Lat,Lng',
    value: `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  });

  // UTM/MGRS tikai, ja ieslēgts UTM režģis
  if (utmOn) {
    rows.push({ id: 'mgrs', label: 'MGRS', value: toMGRS8(lat, lng) });
  }

  // LKS-92 tikai, ja ieslēgts LKS režģis
  if (lksOn) {
    const L = wgsToLKS(lat, lng);
    rows.push({ id: 'lks', label: 'LKS-92', value: `E ${Math.round(L.E)}, N ${Math.round(L.N)}` });
  }

  return rows;
}




// Ikona, ko liekam uz kopēšanas pogām popupā (vienreiz visā failā)
const copySVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
       stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
       aria-hidden="true" width="18" height="18">
    <rect x="9" y="9" width="10" height="12" rx="2"></rect>
    <rect x="5" y="3" width="10" height="12" rx="2"></rect>
  </svg>`;

	  
// POPUP (labais klikšķis; gribi – nomaini 'contextmenu' uz 'click')
// POPUP (labais klikšķis; gribi – nomaini 'contextmenu' uz 'click')
map.on('contextmenu', (e) => {
  const rows = rowsForPopup(e.latlng.lat, e.latlng.lng);

  const html = `
    <div class="coord-popup">
      ${rows.map(r => `
        <div class="coord-row">
          <span class="label">${r.label}</span>
          <span class="value" id="${r.id}Val">${r.value}</span>
          <button class="copy-btn" id="copy-${r.id}"
                  title="Kopēt ${r.label}" aria-label="Kopēt ${r.label}">
            ${copySVG}
          </button>
          <span class="copied-msg" id="copied-${r.id}">Nokopēts!</span>
        </div>
      `).join('')}
    </div>`;

  L.popup({ maxWidth: 480 })
    .setLatLng(e.latlng)
    .setContent(html)
    .openOn(map);
});

// “Kopēt” – generiski visām rindām popupā
map.on('popupopen', ev => {
  const root = ev.popup.getElement();
  if (!root) return;

  root.querySelectorAll('button.copy-btn[id^="copy-"]').forEach(btn => {
    const id  = btn.id.replace('copy-', '');
    const val = root.querySelector(`#${id}Val`)?.textContent || '';
    const msg = root.querySelector(`#copied-${id}`);

    btn.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(val);
        } else {
          const ta = document.createElement('textarea');
          ta.value = val;
          ta.style.position = 'fixed';
          ta.style.opacity  = '0';
          document.body.appendChild(ta);
          ta.focus(); ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        btn.classList.add('copied');
        msg && msg.classList.add('show');
        setTimeout(() => {
          btn.classList.remove('copied');
          msg && msg.classList.remove('show');
        }, 900);
      } catch (_) {}
    });
  });
});






	  
// kad sāk kustēties – aizver popup un iedokē pogas
map.on('movestart zoomstart dragstart', () => {
  map.closePopup();
  const bc = document.getElementById('buttonContainer');
  bc && bc.classList.add('docked');
});

// ja gribi arī uz jebkura pieskāriena uz kartes
map.getContainer().addEventListener('pointerdown', () => {
  const bc = document.getElementById('buttonContainer');
  bc && bc.classList.add('docked');
}, {passive:true});
    inited = true;
    return true;
  }

  /* ---------------------- Tumšošanas sinhronizācija ---------------------- */
  function syncDimOverlay(){
    if (!dimRange) return;
    const v = +dimRange.value || 0;            // 0..80
    const a = Math.min(0.8, Math.max(0, v/100));
    mapDim.style.background = 'rgba(0,0,0,' + a + ')';
  }
// padarām pieejamu “binderi”, ja slīdnis parādās vēlāk
// Sasien slīdni ar vienoto iestatītāju
window.__bindDimmer = function(inputEl){
  if(!inputEl) return;
  const saved = +(localStorage.getItem('mapDarken') || 0);
  inputEl.value = saved;
  inputEl.addEventListener('input', () => setDarkness(inputEl.value));
  setDarkness(saved); // piemēro uzreiz
};





// ieliec tieši virs showOnlineMap/hideOnlineMap
function getEls(){
  return {
    mapDiv:  document.getElementById('onlineMap'),
    mapDim:  document.getElementById('onlineMapDim'),
    canvas:  document.getElementById('mapCanvas'),
    resizeH: document.getElementById('resizeHandle'),
    btn:     document.getElementById('toggleOnlineMap'),
   dimRange: document.getElementById('mapDimmerRange'),
  };
}





// --- Leaflet loader (idempotent) -------------------------------------------
window.leafletReady = window.leafletReady || (function () {
  return new Promise((resolve, reject) => {
    const done = () => resolve(window.L);

    // jau ielādēts?
    if (window.L && window.L.map) return done();

    // mēģinām atrast jau esošu <script> ar leaflet
    let s = document.querySelector('script[src*="leaflet"]');
    if (!s) {
      // ja nav – ieliekam no CDN (CSS + JS)
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);

      s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.defer = true;
      document.head.appendChild(s);
    }

    s.addEventListener('load', () => (window.L && window.L.map) ? done() : reject(new Error('Leaflet loaded but L.map missing')));
    s.addEventListener('error', () => reject(new Error('Leaflet script error')));

    // drošības timeouts
    setTimeout(() => {
      (window.L && window.L.map) ? done() : reject(new Error('Leaflet timeout'));
    }, 7000);
  });
})();





	
	
  /* ---------------------- Rādīt / slēpt tiešsaistes karti ---------------------- */

async function showOnlineMap(){
  const { mapDiv, mapDim, canvas, resizeH, btn } = getEls();
  if (!mapDiv || !mapDim || !canvas) return; // sargs

  try { await window.leafletReady; }
  catch (e) {
    console.warn('[onlineMap] Leaflet neielādējās laikā:', e);
    return;
  }




	
  // PARĀDĀM karti, paslēpjam kanvu + rokturi
  mapDiv.style.display = 'block';
  mapDim.style.display = 'block';
  canvas.style.display = 'none';
  if (resizeH) resizeH.style.display = 'none';

  // nodrošinam izmēru pirms init/invalidate
  if (!mapDiv.offsetWidth || !mapDiv.offsetHeight){
    const p = mapDiv.parentElement;
    mapDiv.style.width  = (p && p.clientWidth  ? p.clientWidth  : window.innerWidth)  + 'px';
    mapDiv.style.height = (p && p.clientHeight ? p.clientHeight : window.innerHeight) + 'px';
  }

  const v = +(localStorage.getItem('mapDarken') || 0);
  setDarkness(v);

  if (!initMap()){
    // Atpakaļ uz kanvu, ja Leaflet nav
    mapDiv.style.display = 'none';
    mapDim.style.display = 'none';
    canvas.style.display = 'block';
    if (resizeH && hasImage()) positionResizeHandle(true);
    localStorage.setItem('onlineMapActive','0');
    alert('Tiešsaistes karte nav ielādēta! Mēģiniet vēlreiz.'); // Leaflet nav ielādējies — tiešsaistes karte izslēgta.
    return;
  }

  requestAnimationFrame(()=> map && map.invalidateSize(true));
  setTimeout(()=> map && map.invalidateSize(true), 100);

  if (btn) btn.classList.add('active');
  localStorage.setItem('onlineMapActive','1');

  syncDimOverlay();
  window.__updateDimmerWidth && window.__updateDimmerWidth();
  window.__fitDock && window.__fitDock();
}

 
function hideOnlineMap(){
  const { mapDiv, mapDim, canvas, resizeH, btn } = getEls();
  if (!mapDiv || !mapDim || !canvas) return; // sargs
  mapDiv.style.display = 'none';
  mapDim.style.display = 'none';
  canvas.style.display = 'block';

  // rokturi rādām tikai tad, ja tiešām ir bilde
  if (resizeH && hasImage()) {
    positionResizeHandle(true);
  } else if (resizeH) {
    resizeH.style.display = 'none';
  }

  if (btn) btn.classList.remove('active');
  localStorage.setItem('onlineMapActive','0');
  window.__updateDimmerWidth && window.__updateDimmerWidth();
  window.__fitDock && window.__fitDock();
}




onDomReady(() => {
  const { btn, dimRange } = getEls();

  if (btn) {
    btn.addEventListener('click', () => {
      const { mapDiv } = getEls();
      const isOn = !!mapDiv && mapDiv.style.display === 'block';
      isOn ? hideOnlineMap() : showOnlineMap();
    }, { passive: true });
  }

  if (localStorage.getItem('onlineMapActive') === '1') {
    leafletReady
      .then(() => showOnlineMap())
      .catch(() => localStorage.setItem('onlineMapActive','0'));
  }

  window.addEventListener('resize', () => window.map && map.invalidateSize());
  if (dimRange) window.__bindDimmer(dimRange);
});


})();











//						img.onload = function () {
//							adjustImageSize();
//							drawImage();
//							positionResizeHandle();
//							resizeHandle.style.display = 'block';
//						};
//
				function adjustImageSize() {
					const aspectRatio = img.naturalWidth / img.naturalHeight;
					const scaleFactor = 0.85; // 📌 Pielāgojam attēlu uz 90% no sākotnējā izmēra

					if (canvas.width / canvas.height > aspectRatio) {
						imgWidth = canvas.height * aspectRatio * scaleFactor;
						imgHeight = canvas.height * scaleFactor;
				} else {
					imgWidth = canvas.width * scaleFactor;
					imgHeight = (canvas.width / aspectRatio) * scaleFactor;
					}
					
						// ✅ Centrējam attēlu kanvā
						imgX = (canvas.width - imgWidth) / 2;
						imgY = (canvas.height - imgHeight) / 2;

						imgScale = 1; // 📌 Nodrošina sākotnējo mērogu (bez tālummaiņas)
						}






								


						

						// Reset Map Button Functionality
	on(byId('resetMap'), 'click', () => {
  adjustImageSize();
  drawImage();
});






// === CANVAS LISTENERI TIKAI, JA KANVA IR =========================
if (canvas) {



						// Attēla pārvietošana
						canvas.addEventListener('mousedown', (e) => {
							if (e.target === resizeHandle) return;
							startX = e.offsetX;
							startY = e.offsetY;
							dragging = true;
						});

						canvas.addEventListener('mousemove', (e) => {
							if (dragging) {
								let dx = e.offsetX - startX;
								let dy = e.offsetY - startY;
								imgX += dx;
								imgY += dy;
								startX = e.offsetX;
								startY = e.offsetY;
								drawImage();
							}
						});

						canvas.addEventListener('mouseup', () => {
							dragging = false;
						});

						// Precīzāka tālummaiņa ar peles riteni
						canvas.addEventListener('wheel', (e) => {
							e.preventDefault();
							const zoomFactor = e.deltaY > 0 ? 0.95 : 1.05;
							const mouseX = e.offsetX;
							const mouseY = e.offsetY;

							// Aprēķina attālumu no kursora līdz attēla pozīcijai
							const offsetX = mouseX - imgX;
							const offsetY = mouseY - imgY;

							// Aprēķina jauno attēla pozīciju pēc tālummaiņas
							imgX = mouseX - offsetX * zoomFactor;
							imgY = mouseY - offsetY * zoomFactor;

							imgScale *= zoomFactor;
							drawImage();
						});


						// Skārienjūtības atbalsts (pārvietošana, tālummaiņa un izmēru maiņa)
						canvas.addEventListener('touchstart', (e) => {
							e.preventDefault();
							if (e.touches.length === 1) { // Pārvietošana
								startX = e.touches[0].clientX;
								startY = e.touches[0].clientY;
								dragging = true;
							} else if (e.touches.length === 2) { // Tālummaiņa
  lastTouchDistance = canvasTouchDistance(e.touches[0], e.touches[1]);
}

						});





						canvas.addEventListener('touchmove', (e) => {
							e.preventDefault();
							if (e.touches.length === 1 && dragging) { // Pārvietošana
								let dx = e.touches[0].clientX - startX;
								let dy = e.touches[0].clientY - startY;
								imgX += dx;
								imgY += dy;
								startX = e.touches[0].clientX;
								startY = e.touches[0].clientY;
								drawImage();
							} else if (e.touches.length === 2) { // Tālummaiņa
  const touch1 = e.touches[0];
  const touch2 = e.touches[1];
  const newDistance = canvasTouchDistance(touch1, touch2);
  let zoomFactor = newDistance / lastTouchDistance;
  lastTouchDistance = newDistance;
								
								// Aprēķina pieskārienu centru
								const centerX = (touch1.clientX + touch2.clientX) / 2;
								const centerY = (touch1.clientY + touch2.clientY) / 2;
								
								// Pielāgo attēla pozīciju, lai tālummaiņa notiktu vietā, kur lietotājs pietuvina
								imgX = centerX - (centerX - imgX) * zoomFactor;
								imgY = centerY - (centerY - imgY) * zoomFactor;
								
								imgScale *= zoomFactor;
								drawImage();
							}
						});



						canvas.addEventListener('touchend', () => {
							dragging = false;
						});
	} // ← BEIGAS: CANVAS LISTENERI

function canvasTouchDistance(touch1, touch2) {
  const dx = touch1.clientX - touch2.clientX;
  const dy = touch1.clientY - touch2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}




						function startResize(e) {
							e.preventDefault();
							resizing = true;
							startX = e.clientX || e.touches[0].clientX;
							startY = e.clientY || e.touches[0].clientY;
							startWidth = imgWidth;
							startHeight = imgHeight;
							document.addEventListener('mousemove', resizeImage);
							document.addEventListener('mouseup', stopResize);
							document.addEventListener('touchmove', resizeImage);
							document.addEventListener('touchend', stopResize);
						}

						function resizeImage(e) {
							if (resizing) {
								let dx = (e.clientX || e.touches[0].clientX) - startX;
								let dy = (e.clientY || e.touches[0].clientY) - startY;
								imgWidth = Math.max(50, startWidth + dx);
								imgHeight = Math.max(50, startHeight + dy);
								drawImage();
							}
						}

						function stopResize() {
							resizing = false;
							document.removeEventListener('mousemove', resizeImage);
							document.removeEventListener('mouseup', stopResize);
							document.removeEventListener('touchmove', resizeImage);
							document.removeEventListener('touchend', stopResize);
						}

						// Piesaiste rokturim pie attēla
function positionResizeHandle(show) {
  if (!resizeHandle) return;

  const canvasHidden = getComputedStyle(canvas).display === 'none';
  if (!show || !hasImage() || canvasHidden) {
    resizeHandle.style.display = 'none';
    return;
  }


  // Padarām mērāmu, bet neredzamu, lai iegūtu pareizos offsetWidth/Height
  const prevVis  = resizeHandle.style.visibility;
  const prevDisp = resizeHandle.style.display;
  resizeHandle.style.visibility = 'hidden';
  resizeHandle.style.display    = 'block';

  const rect   = canvas.getBoundingClientRect();
  const pageX  = rect.left + window.scrollX;
  const pageY  = rect.top  + window.scrollY;
  const scaleX = rect.width  / canvas.width;
  const scaleY = rect.height / canvas.height;

const cs = getComputedStyle(resizeHandle);
const w = resizeHandle.offsetWidth  || parseInt(cs.width)  || 12;
const h = resizeHandle.offsetHeight || parseInt(cs.height) || 12;


  const imgCssW = imgWidth  * imgScale * scaleX;
  const imgCssH = imgHeight * imgScale * scaleY;
  const imgCssX = pageX + (imgX * scaleX);
  const imgCssY = pageY + (imgY * scaleY);

  let left = imgCssX + imgCssW - w;
  let top  = imgCssY + imgCssH - h;

  // Stingri iekš attēla robežām
  left = Math.max(imgCssX, Math.min(imgCssX + imgCssW - w, left));
  top  = Math.max(imgCssY, Math.min(imgCssY + imgCssH - h, top));

  resizeHandle.style.left       = left + 'px';
  resizeHandle.style.top        = top  + 'px';
  resizeHandle.style.visibility = prevVis || 'visible';
  resizeHandle.style.display    = 'block';
}



























// === Attēla / PDF (ar lappuses izvēli) augšupielāde — fails vai URL ===



/* te bija vecais injectUploadCSS */

/* ==== Viss zemāk — TAVS oriģinālais, neskarts JS (funkcionalitāte) ==== */

/* te bija vecais openchoosermodal */

function openPdfPagePicker(total){
  return new Promise((resolve)=>{
    const wrap = document.createElement('div');
    wrap.className='uploader-backdrop';
    wrap.innerHTML = `
      <div class="uploader-card picker">
        <h3>PDF ar ${total} lapām!</h3>
        <p>Šī lietotne importē <b>vienu</b> lapu kā attēlu. Izvēlies lapu vai atcel.</p>

        <div class="picker-row">
          <input id="pg" type="number" min="1" max="${total}" value="1" aria-label="PDF lapa">
          <button id="pOk">Importēt</button>
        </div>

        <div class="footer-row">
          <button id="pCancel">Aizvērt</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const done=(v)=>{ try{document.body.removeChild(wrap);}catch(_){ } resolve(v); };

    // drošs piesaistes veids (ja kāds elements nav, nekrītam)
    const pCancel = wrap.querySelector('#pCancel');
    const pOk     = wrap.querySelector('#pOk');
    const inp     = wrap.querySelector('#pg');

    if (pCancel) pCancel.addEventListener('click', ()=> done(null));
    wrap.addEventListener('click', (e)=>{ if (e.target===wrap) done(null); });

    if (pOk && inp){
      const submit = ()=>{
        const n  = parseInt(inp.value, 10) || 1;
        const pg = Math.min(total, Math.max(1, n));
        done(pg);
      };
      pOk.addEventListener('click', submit);
      inp.addEventListener('keydown', (e)=>{ if (e.key==='Enter'){ e.preventDefault(); submit(); } });
    }
  });
}

// — palīgs: droša Uint8Array kopija (novērš “detached ArrayBuffer”) —
function toPdfBytes(input){
  if (input instanceof Uint8Array) {
    const {buffer, byteOffset, byteLength} = input;
    return new Uint8Array(buffer.slice(byteOffset, byteOffset + byteLength));
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input.slice(0));
  }
  if (ArrayBuffer.isView(input)) {
    const {buffer, byteOffset, byteLength} = input;
    return new Uint8Array(buffer.slice(byteOffset, byteOffset + byteLength));
  }
  throw new Error('Unsupported PDF bytes');
}

// PDF → PNG dataURL (viena izvēlēta lapa)
function renderPdfToDataURL(pdfBytes, pageNum, targetW=2000){
  const bytes = toPdfBytes(pdfBytes);
  return pdfjsLib.getDocument({ data: bytes }).promise.then(pdf=>{
    pageNum = Math.min(pdf.numPages, Math.max(1, pageNum||1));
    return pdf.getPage(pageNum).then(page=>{
      const v1 = page.getViewport({scale:1});
      const scale = Math.max(1, targetW / v1.width);
      const vp = page.getViewport({scale});
      const c  = document.createElement('canvas');
      const cx = c.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      c.width  = Math.round(vp.width  * dpr);
      c.height = Math.round(vp.height * dpr);
      c.style.width  = Math.round(vp.width)  + 'px';
      c.style.height = Math.round(vp.height) + 'px';
      const rc = { canvasContext: cx, viewport: vp, transform: dpr!==1 ? [dpr,0,0,dpr,0,0] : null };
      return page.render(rc).promise.then(()=> c.toDataURL('image/png'));
    });
  });
}

// Ielāde no URL (attēls vai PDF)
function loadFromURL(url){
  const looksPdf = /\.pdf(\?|#|$)/i.test(url);
  fetch(url, { mode: 'cors' })
    .then(async r=>{
      if(!r.ok) throw new Error('HTTP '+r.status);
      const ct = (r.headers.get('content-type')||'').toLowerCase();
      if (looksPdf || ct.includes('application/pdf')) {
        if (!window.pdfjsLib) throw new Error('PDF.js nav ielādēts');
        const ab = await r.arrayBuffer();
        return pdfjsLib.getDocument({ data: toPdfBytes(ab) }).promise.then(async(pdf)=>{
          let page = 1;
          if (pdf.numPages>1){
            const pick = await openPdfPagePicker(pdf.numPages);
            if (!pick) return null;
            page = pick;
          }
          return renderPdfToDataURL(ab, page);
        });
      } else if (ct.startsWith('image/')) {
        const blob = await r.blob();
        const urlObj = URL.createObjectURL(blob);
        img.onload = () => { try{ URL.revokeObjectURL(urlObj); }catch(_){ } };
        img.src = urlObj;
        return null;
      } else {
        img.src = url;
        return null;
      }
    })
    .then(dataURL=>{
      if (dataURL) img.src = dataURL;
    })
    .catch(err=>{
      console.warn('[URL load]', err);
      if (looksPdf) {
        alert('Neizdevās ielādēt PDF no URL (CORS vai kļūda).');
      } else {
        try { img.crossOrigin = 'anonymous'; } catch(_){}
        img.src = url;
      }
    });
}

// Ielāde no faila (attēls vai PDF)
async function loadFromFile(file){
  const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
  if (isPdf){
    if (!window.pdfjsLib) { alert('PDF.js nav ielādēts.'); return; }
    try{
      const ab = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: toPdfBytes(ab) }).promise;
      let page = 1;
      if (pdf.numPages>1){
        const pick = await openPdfPagePicker(pdf.numPages);
        if (!pick) return;
        page = pick;
      }
      const dataURL = await renderPdfToDataURL(ab, page);
      img.src = dataURL;
    }catch(err){
      console.error('[PDF faila ielāde]', err);
      alert('Neizdevās apstrādāt PDF.');
    }
  } else if (/^image\//i.test(file.type)){
    const r = new FileReader();
    r.onload = e => { img.src = e.target.result; };
    r.onerror = ()=> alert('Neizdevās nolasīt attēlu.');
    r.readAsDataURL(file);
  } else {
    alert('Atbalstīti ir attēli vai PDF.');
  }
}

// Poga “Ielādēt karti”
const uploadBtn = document.getElementById('uploadMap');
if (uploadBtn){
  uploadBtn.addEventListener('click', ()=>{
    openChooserModal().then(choice=>{
      if (!choice) return;
      if (choice.kind === 'file') loadFromFile(choice.file);
      else if (choice.kind === 'url') loadFromURL(choice.url);
    });
  });
}























// === Modal dizains (upsert: ja #upload-ui-css jau ir, pārrakstām) ===
// — DEVTOOL dizains + moderns drop-laukums (UPsert) —
(function injectUploadCSS(){
  const id='upload-ui-css';
  const css = `

/* Lielāks logs uz datoriem, mobīlajiem paliek kā bija */
@media (min-width: 992px){
  .uploader-card{
    width: clamp(520px, 50vw, 720px); /* patīkami plašs uz desktopa */
  }
}



/* === KARTE: palielināts augstums desktopā, lai nebūtu “desa” === */
@media (min-width: 992px){
  .uploader-card{
    width: clamp(560px, 48vw, 840px);
    min-height: 480px;     /* ← šis reāli dod lielāku “loga” augstumu */
    max-height: 80vh;      /* neļaujam pāraugt ekrānu */
    display: flex;
    flex-direction: column;
  }
  .dropzone{ min-height: 180px; }  /* lai saturs vizuāli sabalansēts */
}

@media (min-width: 992px){
  .uploader-card.picker{
    min-height: 170px; /* pārspēj .uploader-card */
  }
}

/* === DROP ikona === */
:root{ --drop-ico: 48px; }       /* pamata izmērs; droši maini */

.dropzone .ico{
  display:inline-flex; align-items:center; justify-content:center;
  width:calc(var(--drop-ico) + 16px); height:calc(var(--drop-ico) + 16px);
  margin-bottom:10px;
  border-radius:50%;
  border:1px solid rgba(143,194,255,.35);
  background:rgba(143,194,255,.10);
  color:#e9f2ff;                 /* ikonas krāsa (caur currentColor) */
  box-shadow:inset 0 0 0 1px #ffffff10;
}
.dropzone .ico svg{
  width:var(--drop-ico); height:var(--drop-ico);
  display:block; fill:currentColor; stroke:currentColor;
}

/* hover/dragover – nedaudz izteiktāks tonis */
.dropzone:hover .ico{
  border-color:#8FC2FF; background:rgba(143,194,255,.18); color:#ffffff;
}
.dropzone.is-dragover .ico{
  border-color:#6EA2FF; background:rgba(110,162,255,.22); color:#ffffff;
}




  
/* Backdrop ar blur (ar fallback) */
.uploader-backdrop{
  position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;
  background:rgba(0,0,0,.55)
}
@supports ((backdrop-filter:blur(8px)) or (-webkit-backdrop-filter:blur(8px))){
  .uploader-backdrop{backdrop-filter:saturate(1.2) blur(8px);-webkit-backdrop-filter:saturate(1.2) blur(8px)}
}

/* Karte */
.uploader-card{
  min-width:320px;max-width:92vw;
  background:linear-gradient(180deg,#1b1f25 0%, #2a0f0faa 100%);
  color:#eef2f7;border:1px solid rgba(255,255,255,.08);
  border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,.55);
  padding:14px 14px 12px
}

/* Head — rādam “Augšupādēt karti” bez JS izmaiņām */
.uploader-card h3{
  margin:0 0 6px;font:700 16px/1.25 system-ui,-apple-system,Segoe UI,Roboto,Arial;letter-spacing:.2px;
  position:relative
}


/* Info */
.uploader-card p{margin:6px 0 10px;opacity:.9;font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,Arial}
.small{opacity:.85;font-size:12px}

/* Moderns dalītājs */
.divider{
  height:1px;margin:10px 0;border:0; background:
  linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent)
}

/* Drop laukums */
/* DROP LAUKUMS — moderns, radius 10px, zilgans hover */
.dropzone{
  user-select:none; -webkit-user-select:none;
  border:2px dashed rgba(255,255,255,.34);
  background:rgba(255,255,255,.05);
  padding:16px;
  text-align:center;
  border-radius:10px;
  cursor:pointer;
  transition:
    background-color .15s ease,
    border-color .15s ease,
    box-shadow .15s ease,
    transform .06s ease;
}
.dropzone .big{
  font:700 13px/1.25 system-ui,-apple-system,Segoe UI,Roboto,Arial;
}
.dropzone small{
  display:block; margin-top:6px; opacity:.82;
}

/* Hover — gaiši zilāks tonis */
.dropzone:hover{
  border-color:#8FC2FF;                  /* gaišā zila */
  background:rgba(143,194,255,.10);
  box-shadow:0 0 0 3px rgba(143,194,255,.22) inset;
}

/* Drag-over — izteiktāka zilā */
.dropzone.is-dragover{
  border-color:#6EA2FF;
  background:rgba(110,162,255,.16);
  box-shadow:0 0 0 3px rgba(110,162,255,.32) inset;
}

/* Fokuss (tastatūra/mobilais) — fallback arī vecākiem pārlūkiem */
.dropzone:focus { outline:2px solid #8FC2FF; outline-offset:2px; }
.dropzone:focus-visible { outline:2px solid #8FC2FF; outline-offset:2px; }

/* Press efekts */
.dropzone:active{ transform:translateY(1px); }

/* URL rinda: ievade + “Importēt” vienā līnijā (mobilē – stāvus) */
.url-row{ display:flex; gap:10px; align-items:stretch }
.url-row input[type="url"]{
  flex:1 1 auto; width:1%;
  background:#0f1318; color:#fff; border:1px solid rgba(255,255,255,.18);
  border-radius:10px; padding:10px; font:13px system-ui,-apple-system,Segoe UI,Roboto,Arial
}
.url-row input[type="url"]:focus{ outline:none; border-color:#6ea2ff66; box-shadow:0 0 0 2px #6ea2ff33 inset }
@media (max-width:640px){ .url-row{ flex-direction:column } }

/* Centrētas pogas */
.uploader-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;justify-content:center}
.uploader-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;justify-content:center}

/* Modernas “plakanas čaulas” pogas (bez apaļiem stūriem) */
.uploader-card button{
  appearance:none;border-radius:0;
  border:1px solid #7f3a3a55;
  background:linear-gradient(180deg,#8d3b3b,#6a2f2f); /* neitrāls sarkanais */
  color:#fff;padding:10px 18px;font:700 13px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial;
  letter-spacing:.2px; cursor:pointer;
  box-shadow:inset 0 0 0 1px #ffffff10, 0 6px 18px rgba(0,0,0,.35);
  -webkit-tap-highlight-color:transparent; touch-action:manipulation;
  transition:filter .12s ease, transform .06s ease, box-shadow .12s ease
}
.uploader-card button:hover{filter:brightness(1.06)}
.uploader-card button:active{transform:translateY(1px)}
.uploader-card button:focus{outline:none}
.uploader-card button:focus-visible{outline:2px solid #ffd2d2;outline-offset:1px}

/* “Atcelt” — izteikti sarkana */
#chCancel,#pCancel,#urlCancel{
  background:linear-gradient(180deg,#e53935,#b71c1c)!important;
  border-color:#ff6e6e88!important
}
#chCancel:hover,#pCancel:hover,#urlCancel:hover{filter:brightness(1.04)}
#chCancel:active,#pCancel:active,#urlCancel:active{transform:translateY(1px)}

/* Ievades lauki */
/* URL var palikt 100% */
.uploader-card input[type="url"]{
  width:100%;
  box-sizing:border-box;
  background:#0f1318; color:#fff;
  border:1px solid rgba(255,255,255,.18);
  border-radius:10px; padding:9px 10px;
  font:13px system-ui,-apple-system,Segoe UI,Roboto,Arial;
}

/* NUMBER – bez 100% platuma! */
.uploader-card input[type="number"]{
  box-sizing:border-box;
  background:#0f1318; color:#fff;
  border:1px solid rgba(255,255,255,.18);
  border-radius:10px; padding:9px 10px;
  font:13px system-ui,-apple-system,Segoe UI,Roboto,Arial;
}
.uploader-card input[type="url"]:focus, .uploader-card input[type="number"]:focus{
  outline:none;border-color:#ff9a9a66;box-shadow:0 0 0 2px #ff9a9a33 inset
}

/* Mobilais */
@media (max-width:760px){ .uploader-card{max-width:92vw} .uploader-card button{padding:12px 18px} }







/* === POGAS === */
/* Bāzes poga: radius 10px, 2px robeža, drošs pāreju komplekts */
.uploader-card button,
.uploader-card .btn{
  -webkit-appearance:none; -moz-appearance:none; appearance:none;
  border-radius:10px !important;
  border-width:2px !important; border-style:solid !important;
  transition:
    background-color .15s ease,
    filter .15s ease,
    transform .06s ease,
    box-shadow .15s ease;
  color:#fff;
  padding:10px 18px;
  font:700 13px/1 system-ui,-apple-system,Segoe UI,Roboto,Arial;
  letter-spacing:.2px;
  box-shadow:inset 0 0 0 1px #ffffff10, 0 8px 20px rgba(0,0,0,.35);
  -webkit-tap-highlight-color:transparent;
  touch-action:manipulation;
}


/* Active — neliels nospiediens */
.uploader-card button:active,
.uploader-card .btn:active{ transform:translateY(0); box-shadow:inset 0 0 0 1px #ffffff12, 0 6px 18px rgba(0,0,0,.30) }

/* Focus redzams gan jaunā, gan vecā stilā */
.uploader-card button:focus,
.uploader-card .btn:focus{ outline:2px solid #ffd2d2; outline-offset:2px }

/* Disabled drošībai */
.uploader-card button[disabled],
.uploader-card .btn[disabled]{ opacity:.6; cursor:not-allowed; filter:none; transform:none; box-shadow:none }





/* — Rindu izlīdzinājums (ja vajag) — */
.uploader-row,
.uploader-actions{
  display:flex; gap:10px; flex-wrap:wrap; justify-content:center;
}

/* — Dropzonai saglabājam esošo dizainu; ja gribi, varam tonēt robežu saskaņā ar pogām — */
.dropzone{ border-color:rgba(255,255,255,.28); }
.dropzone.is-dragover{ box-shadow:0 0 0 3px #6ea2ff33 inset; border-color:#6ea2ff; }



/* === ZAĻĀS DARBĪBAS ===
   No faila, No URL, Importēt */
.uploader-card .btn.primary,
#chFile,#chUrl,#urlGo,#pOk{
  border-color:#11cb1e !important;
  background:#0d631d !important;       /* precīzā vēlamā pamatkrāsa */
}
.uploader-card .btn.primary:hover,
#chFile:hover,#chUrl:hover,#urlGo:hover,#pOk:hover{
  filter:brightness(1.12);
  background:#117a26 !important;       /* nedaudz gaišāks hover */
  box-shadow:inset 0 0 0 1px #ffffff12, 0 12px 28px rgba(0,0,0,.45);
}
.uploader-card .btn.primary:active,
#chFile:active,#chUrl:active,#urlGo:active,#pOk:active{
  filter:brightness(1.06); transform:translateY(0);
}

/* === SARKANĀS DARBĪBAS ===
   Atcelt, Aizvērt */
.uploader-card .btn.danger,
#chCancel,#pCancel,#urlCancel{
    border-color: #ff0000 !important;
    background: #791905 !important;
    margin-top: 10px;
    width: 50%;
}
.uploader-card .btn.danger:hover,
#chCancel:hover,#pCancel:hover,#urlCancel:hover{
  filter:brightness(1.10);
  background:#c02400 !important;       /* izteiktāks hover tonis */
  box-shadow:inset 0 0 0 1px #ffffff12, 0 12px 28px rgba(0,0,0,.45);
}
.uploader-card .btn.danger:active,
#chCancel:active,#pCancel:active,#urlCancel:active{
  filter:brightness(1.04); transform:translateY(0);
}

/* Lai rindas izskatās sakārtotas arī uz plašiem ekrāniem */
.uploader-row,.uploader-actions{ justify-content:center; }


/* Virsraksts un info centrēti */
.uploader-card h3,
.uploader-card p{
  text-align: center;
}

/* === BACKDROP: garantēta pilna augstuma aizņemšana + komforta atstarpes === */
.uploader-backdrop{
  position: fixed;
  inset: 0;
  min-height: 100vh;   /* fallback vecākiem pārlūkiem */
  min-height: 100dvh;  /* moderniem pārlūkiem ar dinamisko viewport */
  display: flex;       /* uzticamāks par grid center dažos engine'os */
  align-items: center;
  justify-content: center;
  padding: 3vh 2vw;    /* lai karte nav pie ekrāna malām uz desktopa */
}


/* drop zonas saturs centrēts gan horizontāli, gan vertikāli */
.dropzone{
  display:flex;
  align-items:center;
  justify-content:center;
  flex-direction:column;
  min-height:200px;          /* jūties brīvi koriģēt (180–240px) */
}



/* Virsraksts + info centrēti, droši pārrakstam citu stilu ietekmi */
.uploader-card > h3,
.uploader-card > p{
  text-align:center !important;
  margin-left:auto; margin-right:auto;
}
/* Kājene ar Atcelt centrā */
.footer-row{ display:flex; justify-content:center }



/* pdf lapu izvēle */


/* PDF lapas izvēle: ievade + "Importēt" vienā līnijā (mobilē – stāvus) */
.picker-row{
  display: flex;
  gap: 10px;
  align-items: stretch;
}

.picker-row input[type="number"]{
  /* tāpat kā URL ievade */
  flex: 1 1 auto;
  width: 1%;                 /* Flex bug fix (Safari/Edge) – ļauj aizpildīt brīvo vietu */
  min-width: 0;              /* lai var samazināties šaurā konteinerā */

  background:#0f1318; color:#fff;
  border:1px solid rgba(255,255,255,.18);
  border-radius:10px;
  padding:10px;
  font:13px system-ui,-apple-system,Segoe UI,Roboto,Arial;
}
.picker-row input[type="number"]:focus{
  outline:none;
  border-color:#6ea2ff66;
  box-shadow:0 0 0 2px #6ea2ff33 inset;
}

/* poga neizstiepjas, paliek blakus */
#pOk{
  flex: 0 0 auto;
  white-space: nowrap;
}

/* uz šauriem ekrāniem, ja gribi uz 2 rindām (tāpat kā URL rindai) */
@media (max-width:640px){
  .picker-row{ flex-direction: column; }
}



/* PDF lapu izvēlnes kartīte (pareizais selektors ar 2 klasēm) */
.uploader-card.picker{
  width: clamp(560px, 48vw, 840px);
  min-height: 170px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}





  `;
  let st=document.getElementById(id);
  if(!st){ st=document.createElement('style'); st.id=id; (document.head||document.documentElement).appendChild(st); }
  st.textContent=css;
})();

// — MODĀĻA markup + drop-laukums (funkcijas atgrieztās vērtības nemainām) —
function openChooserModal(){
  return new Promise((resolve)=>{
    const wrap = document.createElement('div');
    wrap.className='uploader-backdrop';
    wrap.innerHTML = `
      <div class="uploader-card">
        <h3>Augšupielādēt karti</h3>
        <hr class="divider">
        <p>Vari augšupielādēt no <b>faila</b> (nomet/klikšķini zemāk) vai ielikt <b>URL</b> (attēls vai PDF).</p>
        <hr class="divider">
        <div class="dropzone" id="dropZone" role="button" tabindex="0" aria-label="Nomet failu vai izvēlies">


 <span class="ico" aria-hidden="true">
    <!-- vienkāršots “upload” SVG; krāsojas ar currentColor -->
    <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M20 22a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 1 0v8a.5.5 0 0 1-.5.5z"/>
      <path d="M23 16.5a.5.5 0 0 1-.35-.15L20 13.7l-2.65 2.65a.5.5 0 1 1-.7-.7l3-3a.5.5 0 0 1 .7 0l3 3a.5.5 0 0 1-.35.85z"/>
      <path d="M25 27.5H15A2.5 2.5 0 0 1 12.5 25v-2a.5.5 0 0 1 1 0v2c0 .83.67 1.5 1.5 1.5h10c.83 0 1.5-.67 1.5-1.5v-2a.5.5 0 0 1 1 0v2A2.5 2.5 0 0 1 25 27.5z"/>
    </svg>
  </span>

  
          <div class="big">Nomet failu šeit</div>
          <small>vai pieskaries/klikšķini, lai izvēlētos no ierīces</small>
        </div>
        <hr class="divider">
        <div class="url-row">
          <input id="urlInput" type="url" placeholder="https://…">
          <button id="urlGo" class="btn-primary">Importēt</button>
        </div>
        <div class="footer-row" style="margin-top:10px">
          <button id="chCancel" class="btn-danger">Atcelt</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    const done = (v)=>{ try{ document.body.removeChild(wrap); }catch(_){ } resolve(v); };

    // Aizvēršana
    wrap.querySelector('#chCancel').onclick = ()=> done(null);
    wrap.addEventListener('click', (e)=>{ if (e.target===wrap) done(null); });



    // URL importēšana
    (function(){
      const go = wrap.querySelector('#urlGo');
      const inp= wrap.querySelector('#urlInput');
      if (!go || !inp) return;
      const submit = ()=>{
        const url = (inp.value||'').trim();
        if (!url) return;
        done({ kind:'url', url });
      };
      go.addEventListener('click', submit);
      inp.addEventListener('keydown', (e)=>{ if (e.key==='Enter'){ e.preventDefault(); submit(); } });
    })();

// — Drop zona (drag & drop + click) —
(function initDrop(){
  var drop = wrap.querySelector('#dropZone');
  if (!drop) return; // nav markup -> nav listeners

  // Nelaižam pārlūku “atvērt” failu lapā
  var prevent = function(e){ e.preventDefault(); e.stopPropagation(); };
  ['dragenter','dragover','dragleave','drop'].forEach(function(ev){
    drop.addEventListener(ev, prevent, false);
  });

  // Uzturam dziļumu, lai 'dragleave' no bērniem nenoņemtu stilu
  var dragDepth = 0;
  drop.addEventListener('dragenter', function(){ dragDepth++; drop.classList.add('is-dragover'); }, false);
  drop.addEventListener('dragover',  function(){ drop.classList.add('is-dragover'); }, false);
  drop.addEventListener('dragleave', function(){
    dragDepth = Math.max(0, dragDepth-1);
    if (!dragDepth) drop.classList.remove('is-dragover');
  }, false);
  drop.addEventListener('drop', function(e){
    dragDepth = 0; drop.classList.remove('is-dragover');
    var dt = e.dataTransfer;
    var file = (dt && dt.files && dt.files.length) ? dt.files[0] : null;
    if (file) done({ kind:'file', file: file });
  }, false);

  // Klikšķis/tastatūra -> failu izvēle
  function pick(){
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*,application/pdf';
    inp.onchange = function(){
      var f = inp.files && inp.files[0];
      done(f ? { kind:'file', file:f } : null);
    };
    inp.click();
  }
  drop.addEventListener('click', pick, false);
  drop.addEventListener('keydown', function(e){
    var k = e.key || e.code, kc = e.keyCode;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar' || kc === 13 || kc === 32){
      e.preventDefault(); pick();
    }
  }, false);
})();
  });
}


					



























































function drawImage() {
    if (!ctx) return; // nav kanvas – nav ko zīmēt droši
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!hasImage()) {
    // nav vēl bilde – NEzīmējam neko un slēpjam rokturi
    positionResizeHandle(false);
    return;
  }

  // 1) Karte
  ctx.drawImage(img, imgX, imgY, imgWidth * imgScale, imgHeight * imgScale);

  // 2) Tumšošana tikai virs kartes
  if (mapDarken > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + mapDarken + ')';
    ctx.fillRect(imgX, imgY, imgWidth * imgScale, imgHeight * imgScale);
    ctx.restore();
  }

  // 3) Sarkanais rāmis
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'red';
  ctx.strokeRect(imgX, imgY, imgWidth * imgScale, imgHeight * imgScale);

  // 4) Roktura pozīcija + parādīšana
// Vecais
//	positionResizeHandle(true);
// jaunais
positionResizeHandle(getComputedStyle(canvas).display !== 'none');
}

						



						function isMobileDevice() {
							const userAgent = navigator.userAgent.toLowerCase();
							const isMobileUserAgent = /iphone|ipad|ipod|android|blackberry|bb10|opera mini|iemobile|windows phone|mobile|tablet/.test(userAgent);
							const isSmallScreen = window.innerWidth < 1024; 
							const isHighDPR = window.devicePixelRatio > 1.5;

							return isMobileUserAgent || (isSmallScreen && isHighDPR);
						}

						function showMessageForDesktopOnly() {
							const fullscreenMessage = document.getElementById('fullscreenMessage');

							if (!isMobileDevice()) {
								fullscreenMessage.classList.remove('fs-message-hidden');
							} else {
								fullscreenMessage.classList.add('fs-message-hidden');
							}
						}

						window.addEventListener('load', showMessageForDesktopOnly);
						window.addEventListener('resize', showMessageForDesktopOnly);


						// Sākotnējais izsaukums
						handleResize();


						checkWindowSize();
						window.addEventListener('resize', checkWindowSize);
						
// ===== START onDomReady wrapper for COMPASS =====
onDomReady(() => {		
						// Pievienojam compassContainer funkcijas pēc tam, kad ir definēts canvas, mapImage utt.

						// Atlasām compassContainer elementu
							const compassContainer = document.getElementById('compassContainer');
							const compassInner = document.getElementById('compassInner');
							const compassScaleContainer = document.getElementById('compassScaleContainer');
							const compassScaleInner = document.getElementById('compassScaleInner');
							const compassNeedle = document.getElementById('compassNeedle');
							const toggleRotationModeButton = document.getElementById('toggleRotationMode');
							const lockRotationModeButton = document.getElementById('lockRotationMode');
							const resetCompassButton = document.getElementById('resetCompass');
//							// Sākotnējās vērtības, lai atjaunotu kompasu
//							const initialCompassLeft = 550; // Sākotnējā X pozīcija
//							const initialCompassTop = 60; // Sākotnējā Y pozīcija
//							const initialGlobalScale = 1; // Sākotnējais mērogs
//							const initialBaseRotation = 0; // Sākotnējā bāzes rotācija
//							const initialScaleRotation = 70; // Sākotnējā skalas rotācija


						// Sākotnējie mainīgie priekš pārvietošanas, rotācijas, mēroga
							let compassIsDragging = false;
							let compassDragStartX = 0;
							let compassDragStartY = 0;
							let compassStartLeft = 0;   // Sākotnējās pozīcijas - var mainīt pēc vajadzības
							let compassStartTop = 0;    // Sākotnējās pozīcijas
							let activeRotationTarget = 'compassInner'; //  Kontrolējam, vai rotējam bāzi vai skalu
							let isTouchingCompass = false; // Lai sekotu līdzi, vai skar kompasu
							let touchStartX = 0; // Pirmais pieskāriena punkts X koordinā
							let touchStartY = 0; // Pirmais pieskāriena punkts Y koordinā
							let isRotationLocked = false; // Vai rotācija ir bloķēta

						// Jaunie mainīgie atsevišķām transformācijām
							let globalScale = 1;      // mērogs visam kompasam (compassScaleContainer)
							let baseRotation = 0;     // rotācija bāzei (compassInner)
							let scaleRotation = 70;    // rotācija skalai (compassScaleInner)
let lastRotation = 0;     // pinch/rotate aprēķinam




// Sākumstāvoklis vienuviet
const COMPASS_INIT = { left: 550, top: 60, scale: 1, base: 0, scaleRot: 70 };
window.COMPASS_INIT = COMPASS_INIT;

function resetCompassToInitial(){
  compassStartLeft = COMPASS_INIT.left;
  compassStartTop  = COMPASS_INIT.top;
  globalScale      = COMPASS_INIT.scale;
  baseRotation     = COMPASS_INIT.base;
  scaleRotation    = COMPASS_INIT.scaleRot;
  updateCompassTransform();
}







						// Helper funkcijas
						function getDistance(touch1, touch2) {
						  const dx = touch2.clientX - touch1.clientX;
						  const dy = touch2.clientY - touch1.clientY;
						  return Math.sqrt(dx * dx + dy * dy);
						}

						function getAngle(touch1, touch2) {
						  const dx = touch2.clientX - touch1.clientX;
						  const dy = touch2.clientY - touch1.clientY;
						  return Math.atan2(dy, dx) * (180 / Math.PI);
						}


						// === FUNKCIJA POGAS NŪKOŠANAI (tikai skārienierīcēs) ===



if (toggleRotationModeButton) {
  toggleRotationModeButton.addEventListener('click', () => {
    activeRotationTarget = (activeRotationTarget === 'compassInner')
      ? 'compassScaleInner'
      : 'compassInner';

    toggleRotationModeButton.style.backgroundColor =
      (activeRotationTarget === 'compassInner') ? 'rgba(91, 16, 16, 0.8)' : 'rgb(187, 1, 1)';
  });
}




						// Notikumu klausītājs pogai, kas bloķē rotāciju
						if (lockRotationModeButton) {
							lockRotationModeButton.addEventListener('click', () => {
								isRotationLocked = !isRotationLocked; // Mainām bloķēšanas statusu
								lockRotationModeButton.classList.toggle('active', isRotationLocked); // Pievienojam vai noņemam aktīvo klasi
							});
						}

						// Pārbaudām, vai poga eksistē
if (resetCompassButton) {
  resetCompassButton.addEventListener('click', () => {
    // gludai animācijai
    compassContainer.classList.add('with-transition');
    compassInner.classList.add('with-transition');
    compassScaleInner.classList.add('with-transition');
    compassScaleContainer.classList.add('with-transition');

    // reāli atjauno sākumstāvokli
    resetCompassToInitial();

    // pēc pārejas noņem klases
    setTimeout(() => {
      compassContainer.classList.remove('with-transition');
      compassInner.classList.remove('with-transition');
      compassScaleInner.classList.remove('with-transition');
      compassScaleContainer.classList.remove('with-transition');
    }, 500);
  });
}



						// Atjauno transformācijas
// DROŠA versija: vienmēr pārvaicā DOM un iziet, ja kas nav gatavs
function updateCompassTransform() {
  const container   = document.getElementById('compassContainer');
  const inner       = document.getElementById('compassInner');
  const scaleWrap   = document.getElementById('compassScaleContainer');
  const scaleInner  = document.getElementById('compassScaleInner');
  if (!container || !inner || !scaleWrap || !scaleInner) return;

  // 1) FORCĒTA pozicionēšana (der arī vecajiem dzinējiem)
  container.style.setProperty('position','absolute','important');
  container.style.setProperty('left', compassStartLeft + 'px', 'important');
  container.style.setProperty('top',  compassStartTop  + 'px', 'important');

  // 2) NEITRALIZĒ jebkuru CSS translate uz konteinera
  var t0 = 'translate(0,0)';
  container.style.transform       = t0;
  container.style.webkitTransform = t0;  // vecs WebKit
  container.style.msTransform     = t0;  // IE9–11

  // 3) Mērogs visam kompasam
  var s = 'scale(' + globalScale + ')';
  scaleWrap.style.transform       = s;
  scaleWrap.style.webkitTransform = s;
  scaleWrap.style.msTransform     = s;

  // 4) Rotācija bāzei
  var r1 = 'rotate(' + baseRotation + 'deg)';
  inner.style.transform       = r1;
  inner.style.webkitTransform = r1;
  inner.style.msTransform     = r1;

  // 5) Rotācija skalai
  var r2 = 'rotate(' + scaleRotation + 'deg)';
  scaleInner.style.transform       = r2;
  scaleInner.style.webkitTransform = r2;
  scaleInner.style.msTransform     = r2;
}





// Nodrošinām, lai stili tiek piemēroti
// Inicializē kompasu tikai tad, kad elementi tiešām ir DOM
(function initCompassSafe(){
  const start = () => {
    const ok =
      document.getElementById('compassContainer') &&
      document.getElementById('compassInner') &&
      document.getElementById('compassScaleContainer') &&
      document.getElementById('compassScaleInner');

    if (!ok) { requestAnimationFrame(start); return; }

    // 1) iestati sākuma stāvokli
    resetCompassToInitial();

    // 2) pārvelc vēlreiz nākamajā kadrā — vecie pārlūki ķeras tieši šeit
    requestAnimationFrame(updateCompassTransform);

    // 3) drošības pēc arī pēc pilnas ielādes
    window.addEventListener('load', updateCompassTransform, { once:true });

    // uzturi saskaņotu uz izmēru maiņām
    window.addEventListener('resize',            updateCompassTransform);
    window.addEventListener('orientationchange', updateCompassTransform);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }
})();

setTimeout(updateCompassTransform, 0);






// === Kompasa klausītāji ar helperi; droši pret “null” un dubultpiesaisti ===
(function bindCompassSection(){
  function bindCompassListeners(){
    const cc = byId('compassContainer');
    if (!cc) { requestAnimationFrame(bindCompassListeners); return; } // gaida, līdz elements parādās
    if (cc.__boundCompass) return;  // nerindē dubulti
    cc.__boundCompass = true;

    // Peles vilkšana
    on(cc, 'mousedown', (e) => {
      e.preventDefault();
      const rect = cc.getBoundingClientRect();
      compassIsDragging = true;
      compassDragStartX = e.clientX - rect.left;
      compassDragStartY = e.clientY - rect.top;
      e.stopPropagation();
    });



document.addEventListener('mousemove', (e) => {
  if (compassIsDragging) {
    compassStartLeft = e.clientX - compassDragStartX;
    compassStartTop  = e.clientY - compassDragStartY;
    updateCompassTransform();
  }
});
document.addEventListener('mouseup', () => { compassIsDragging = false; });
	  

    // Skārieni: start
    on(cc, 'touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        isTouchingCompass = true;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        compassDragStartX = e.touches[0].clientX - compassStartLeft;
        compassDragStartY = e.touches[0].clientY - compassStartTop;
      } else if (e.touches.length === 2) {
        lastTouchDistance = getDistance(e.touches[0], e.touches[1]);
        lastRotation = getAngle(e.touches[0], e.touches[1]);
      }
    }, { passive:false });

    // Skārieni: move (drag / pinch / rotate)
    on(cc, 'touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && isTouchingCompass) {
        compassStartLeft = e.touches[0].clientX - compassDragStartX;
        compassStartTop  = e.touches[0].clientY - compassDragStartY;
        updateCompassTransform();
      } else if (e.touches.length === 2) {
        const newDistance = getDistance(e.touches[0], e.touches[1]);
        globalScale *= newDistance / lastTouchDistance;
        lastTouchDistance = newDistance;

        if (!isRotationLocked) {
          const newRotation = getAngle(e.touches[0], e.touches[1]);
          if (activeRotationTarget === 'compassInner') {
            baseRotation  += newRotation - lastRotation;
          } else if (activeRotationTarget === 'compassScaleInner') {
            scaleRotation += newRotation - lastRotation;
          }
          lastRotation = newRotation;
        }
        updateCompassTransform();
      }
    }, { passive:false });

    // Skārieni: end
    on(cc, 'touchend', () => { isTouchingCompass = false; });

    // Ritenītis (zoom/rotācija)
    on(cc, 'wheel', (e) => {
      e.preventDefault();
      if (e.shiftKey) {
        baseRotation += e.deltaY * 0.005;
      } else if (e.altKey) {
        globalScale += e.deltaY * -0.0005;
        globalScale  = Math.min(Math.max(0.5, globalScale), 5);
      } else if (e.ctrlKey) {
        scaleRotation += e.deltaY * 0.005;
      }
      updateCompassTransform();
    }, { passive:false });
  }

  // Piesaista, kad DOM gatavs (un vēlreiz kā rezerve pēc window.load)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindCompassListeners, { once:true });
  } else {
    bindCompassListeners();
  }
  window.addEventListener('load', bindCompassListeners, { once:true });

  // Sākumstāvoklis pēc ielādes
  window.addEventListener('load', resetCompassToInitial, { once:true });
})();




// ✅ Rotate 90° popup — droši ar helperi
let isCompassLocked = false;

on(byId('rotateCompass90'), 'click', function (ev) {
  ev.preventDefault();
  ev.stopPropagation();

  const compassInner      = byId('compassInner');
  const compassScaleInner = byId('compassScaleInner');
  const lockBtn           = byId('lockRotationMode');
  const rotateBtn         = byId('rotateCompass90');

  // ja kāds elements nav, vienkārši izejam
  if (!compassInner || !compassScaleInner || !lockBtn || !rotateBtn) return;

  if (!isCompassLocked) {
    // uztaisām popup
    const popupMenu = document.createElement('div');
    popupMenu.id = 'popupMenu';

    const menuTitle = document.createElement('p');
    menuTitle.textContent = 'Izvēlieties noteikšanas metodi:';
    popupMenu.appendChild(menuTitle);

    const row = document.createElement('div');
    row.className = 'button-row';

    // +90°
    const b90 = document.createElement('button');
    b90.id = 'rotateTo90';
    b90.className = 'popup-button';
    const img90 = document.createElement('img');
    img90.src = './img/GRID_VIEW_1_OPTION.png';
    img90.alt = 'Rotēt 90°';
    b90.appendChild(img90);
    row.appendChild(b90);

    // -90°
    const b_90 = document.createElement('button');
    b_90.id = 'rotateToNegative90';
    b_90.className = 'popup-button';
    const img_90 = document.createElement('img');
    img_90.src = './img/GRID_VIEW_2_OPTION.png';
    img_90.alt = 'Rotēt -90°';
    b_90.appendChild(img_90);
    row.appendChild(b_90);

    popupMenu.appendChild(row);
    document.body.appendChild(popupMenu);

    const closePopup = () => { try { document.body.removeChild(popupMenu); } catch(_){} };

    b90.addEventListener('click', () => {
      compassInner.classList.add('with-transition');
      compassScaleInner.classList.add('with-transition');

      baseRotation = 90;                 // ← izmanto tavu globālo
      updateCompassTransform();

      isRotationLocked = true;           // ← arī tavs globālais
      lockBtn.classList.add('active');
      rotateBtn.classList.add('active');
      isCompassLocked = true;

      setTimeout(() => {
        compassInner.classList.remove('with-transition');
        compassScaleInner.classList.remove('with-transition');
      }, 500);

      closePopup();
    });

    b_90.addEventListener('click', () => {
      compassInner.classList.add('with-transition');
      compassScaleInner.classList.add('with-transition');

      baseRotation = -90;
      updateCompassTransform();

      isRotationLocked = true;
      lockBtn.classList.add('active');
      rotateBtn.classList.add('active');
      isCompassLocked = true;

      setTimeout(() => {
        compassInner.classList.remove('with-transition');
        compassScaleInner.classList.remove('with-transition');
      }, 500);

      closePopup();
    });

    // klikšķis ārpus popup — aizver
    setTimeout(() => {
      const onDocClick = (e) => {
        if (!popupMenu.contains(e.target)) {
          document.removeEventListener('click', onDocClick, true);
          closePopup();
        }
      };
      document.addEventListener('click', onDocClick, true);
    }, 0);

  } else {
    // atbloķējam
    isRotationLocked = false;
    lockBtn.classList.remove('active');
    rotateBtn.classList.remove('active');
    isCompassLocked = false;
  }
});

	


window.updateCompassTransform = updateCompassTransform;
window.resetCompassToInitial  = resetCompassToInitial;


	
}); // ===== END onDomReady wrapper for COMPASS =====


// LongTask → pārkrāso kompasu nākamajā kadra brīdī
(function longTaskHeal(){
  try {
    if (
      window.PerformanceObserver &&
      PerformanceObserver.supportedEntryTypes &&
      PerformanceObserver.supportedEntryTypes.indexOf('longtask') !== -1
    ) {
      var po = new PerformanceObserver(function(){
        requestAnimationFrame(function(){
          try { updateCompassTransform(); } catch(e){}
        });
      });
      po.observe({ entryTypes: ['longtask'] });
    }
  } catch (e) {
    // vecs pārlūks – vienkārši izlaižam bez kļūdas
  }
})();

// “Watchdog” – līdz kompasa inline stāvoklis tiešām ir uzlikts
(function compassWatchdog(){
  const MAX_MS = 2000, STEP = 80;
  let t = 0, id = null;

  function tick(){
    try { resetCompassToInitial(); updateCompassTransform(); } catch(e){}
    const c = document.getElementById('compassContainer');
    if (!c) { id = setTimeout(tick, STEP); t+=STEP; return; }

    const cs   = getComputedStyle(c);
    const left = parseFloat(cs.left)  || 0;
    const top  = parseFloat(cs.top)   || 0;
const init = window.COMPASS_INIT || { left: 0, top: 0 };
const ok = Math.abs(left - init.left) < 1 &&
          Math.abs(top  - init.top ) < 1;

    if (!ok && t < MAX_MS) { id = setTimeout(tick, STEP); t+=STEP; }
  }

  // startē drīz, bet ne uzreiz (dod vietu citiem starta darbiem)
  setTimeout(tick, 0);
  window.addEventListener('load', tick, {once:true});
})();

























							

	
								(function() {
								const toggleFullscreenButton = document.getElementById('toggleFullscreen');
								const fullscreenIcon = document.getElementById('fullscreenIcon');
								const fullscreenPopup = document.getElementById('fullscreenPopup');
  if (!toggleFullscreenButton || !fullscreenIcon || !fullscreenPopup) return;
								const enterFullscreenIcon = './img/fullscreen_enter.png';
								const exitFullscreenIcon = './img/fullscreen_exit.png';

								// Iestatām sākotnējo ikonu
								fullscreenIcon.src = enterFullscreenIcon;

								toggleFullscreenButton.addEventListener('click', () => {
									const elem = document.documentElement;
									if (!isFullscreenActive()) {
										enterFullscreen(elem);
									} else {
										exitFullscreen();
									}
								});

								function enterFullscreen(elem) {
									if (elem.requestFullscreen) {
										elem.requestFullscreen().catch(err => console.warn('Pilnekrāna kļūda:', err));
									} else if (elem.webkitRequestFullscreen) {
										elem.webkitRequestFullscreen();
									} else if (elem.msRequestFullscreen) {
										elem.msRequestFullscreen();
									} else if (elem.mozRequestFullScreen) {
										elem.mozRequestFullScreen();
									}
								}

								function exitFullscreen() {
									if (document.exitFullscreen) {
										document.exitFullscreen().catch(err => console.warn('Iziešanas kļūda:', err));
									} else if (document.webkitExitFullscreen) {
										document.webkitExitFullscreen();
									} else if (document.msExitFullscreen) {
										document.msExitFullscreen();
									} else if (document.mozCancelFullScreen) {
										document.mozCancelFullScreen();
									}
								}

								function updateButtonState() {
									if (isFullscreenActive()) {
										fullscreenIcon.src = exitFullscreenIcon;
										toggleFullscreenButton.classList.add('active');
										showPopupMessage('Pilnekrāna režīms ieslēgts', 'popup-success');
									} else {
										fullscreenIcon.src = enterFullscreenIcon;
										toggleFullscreenButton.classList.remove('active');
										showPopupMessage('Pilnekrāna režīms izslēgts', 'popup-error');
									}
								}

								function isFullscreenActive() {
									return document.fullscreenElement || 
										   document.webkitFullscreenElement || 
										   document.mozFullScreenElement || 
										   document.msFullscreenElement;
								}

								function showPopupMessage(message, popupClass) {
									fullscreenPopup.textContent = message;
									fullscreenPopup.className = ''; 
									fullscreenPopup.classList.add(popupClass);
									fullscreenPopup.style.display = 'block';

									setTimeout(() => {
										fullscreenPopup.style.display = 'none';
									}, 4000);
								}

								// Klausītāji
								document.addEventListener('fullscreenchange', updateButtonState);
								document.addEventListener('webkitfullscreenchange', updateButtonState);
								document.addEventListener('mozfullscreenchange', updateButtonState);
								document.addEventListener('MSFullscreenChange', updateButtonState);

								window.addEventListener('keydown', (e) => {
									if (e.key === 'Escape') {
										exitFullscreen();
									}
								});

								window.addEventListener('visibilitychange', function () {
									if (!document.hidden) {
										updateButtonState();
									}
								});
							})();




on(byId("toggleMaterials"), "click", function() {
  let menu = byId("dropdownMaterials");
  let toggleButton = byId("toggleMaterials");
  if (!menu || !toggleButton) return;
  menu.classList.toggle("visible");
  toggleButton.classList.toggle("active");
});

on(byId("toggleInstruction"), "click", function() {
  let menu = byId("dropdownInstruction");
  let toggleButton = byId("toggleInstruction");
  if (!menu || !toggleButton) return;
  menu.classList.toggle("visible");
  toggleButton.classList.toggle("active");
});


							document.addEventListener("click", function(event) {
  const instructionMenu   = document.getElementById("dropdownInstruction");
  const materialsMenu     = document.getElementById("dropdownMaterials");
  const instructionButton = document.getElementById("toggleInstruction");
  const materialsButton   = document.getElementById("toggleMaterials");

  if (instructionMenu && instructionButton &&
      !instructionMenu.contains(event.target) && !instructionButton.contains(event.target)) {
    instructionMenu.classList.remove("visible");
    instructionButton.classList.remove("active");
  }

  if (materialsMenu && materialsButton &&
      !materialsMenu.contains(event.target) && !materialsButton.contains(event.target)) {
    materialsMenu.classList.remove("visible");
    materialsButton.classList.remove("active");
  }
});



							//ATVER IFRAME MACIBU MATERIALI
							document.querySelectorAll('.dropdown-menu a').forEach(link => {
								link.addEventListener('click', function(event) {
									event.preventDefault();

									let iframe = document.getElementById('contentFrame');
									let dropdownMenus = document.querySelectorAll('.dropdown-menu');

									// Parāda iframe un palielina tā augstumu līdz 85vh
									iframe.style.display = 'block';
									iframe.classList.add('active');
									iframe.src = this.getAttribute('href');

									// Paceļ dropdown pogas uz augšu
									dropdownMenus.forEach(menu => menu.classList.add('shrink'));
								});
							});



							// Aizver iframe un atgriež sākotnējo pogu un iframe pozīciju MACIBU MATERIALI
							on(byId("toggleMaterials"),  "click", function() {
								let iframe = document.getElementById('contentFrame');
								let dropdownMenus = document.querySelectorAll('.dropdown-menu');

								// Paslēpj iframe un atjauno sākotnējo augstumu
								iframe.classList.remove('active');
								setTimeout(() => {
									iframe.style.display = 'none';
									iframe.src = ""; // Noņem saturu
								}, 300); // Aizkave, lai CSS animācija pabeigtos pirms iframe slēpšanas

								// Atjauno dropdown pogu pozīciju
								dropdownMenus.forEach(menu => menu.classList.remove('shrink'));
							});



							// Atver iframe priekš "Lietotāja ceļveža"
							document.querySelectorAll('#dropdownInstruction a').forEach(link => {
								link.addEventListener('click', function(event) {
									event.preventDefault();

									let iframe = document.getElementById('instructionFrame'); // Lietotāja ceļveža iframe
									let dropdownMenus = document.getElementById('dropdownInstruction');

									// Parāda iframe un ielādē saiti
									iframe.style.display = 'block';
									iframe.classList.add('active');
									iframe.src = this.getAttribute('href');

									// Paslēpj izvēlni
									dropdownMenus.classList.add('shrink');
								});
							});

							// Aizver iframe un atjauno sākotnējo pogu un iframe pozīciju priekš "Lietotāja ceļveža"
							on(byId("toggleInstruction"),"click", function() {
								let iframe = document.getElementById('instructionFrame'); // Lietotāja ceļveža iframe
								let dropdownMenus = document.getElementById('dropdownInstruction');

								iframe.classList.remove('active');
								setTimeout(() => {
									iframe.style.display = 'none';
									iframe.src = ""; // Notīra saturu
								}, 300);

								dropdownMenus.classList.remove('shrink');
							});




							document.querySelectorAll('.dropdown-menu a').forEach(link => {
								link.addEventListener('click', function(event) {
									event.preventDefault();
									let iframe = document.getElementById('contentFrame');
									let dropdownMenus = document.querySelectorAll('.dropdown-menu');

									// Ielādē saiti iframe un parāda to
									iframe.style.display = 'block';
									iframe.classList.add('active');
									iframe.src = this.getAttribute('href');

									// Paceļ dropdown pogas uz augšu
									dropdownMenus.forEach(menu => menu.classList.add('shrink'));
								});
							});




							// Atver atsauksmes un ziņojumi
							function toggleIframeAbout(event) {
								if (event) event.preventDefault(); // Novērš noklusēto darbību

								let iframeContainer = document.getElementById("iframeContainerAbout");
								let computedStyle = window.getComputedStyle(iframeContainer);

								console.log("Poga nospiesta!");
								console.log("iframeContainer sākuma statuss:", {
									display: computedStyle.display,
									bottom: computedStyle.bottom
								});

								if (computedStyle.display === "none" || computedStyle.bottom === "-620px") {
									console.log("Atveram iframe...");
									iframeContainer.style.display = "block";
									setTimeout(() => {
										iframeContainer.style.bottom = "35px"; // Slīd uz augšu no apakšas
										console.log("iframeContainer pēc atvēršanas:", {
											display: iframeContainer.style.display,
											bottom: iframeContainer.style.bottom
										});
									}, 10);
								} else {
									console.log("Aizveram iframe...");
									iframeContainer.style.bottom = "-620px"; // Slīd atpakaļ uz leju
									setTimeout(() => {
										iframeContainer.style.display = "none";
										console.log("iframeContainer pēc aizvēršanas:", {
											display: iframeContainer.style.display,
											bottom: iframeContainer.style.bottom
										});
									}, 500);
								}
							}





							document.addEventListener("DOMContentLoaded", function () {
								let iframeContainer = document.getElementById("iframeContainerAbout");

								// Pārliecinās, ka iframe sākumā ir paslēpts
								iframeContainer.style.display = "none";
								iframeContainer.style.bottom = "-220px";
								console.log("iframeContainer iestatīts uz slēgtu stāvokli lapas ielādē!");
							});





							// QR koda atvēršana/aizvēršana
							function toggleIframeQR(event) {
								if (event) event.preventDefault();

								let iframeContainer = document.getElementById("iframeContainerQR");
								let computedStyle = window.getComputedStyle(iframeContainer);

								if (computedStyle.display === "none" || computedStyle.bottom === "-370px") {
									iframeContainer.style.display = "block";
									setTimeout(() => {
										iframeContainer.style.bottom = "35px";
									}, 10);
								} else {
									iframeContainer.style.bottom = "-370px";
									setTimeout(() => {
										iframeContainer.style.display = "none";
									}, 500);
								}
							}

							// Paslēpj QR kodu sākumā
							document.addEventListener("DOMContentLoaded", function () {
								let iframeContainer = document.getElementById("iframeContainerQR");
								iframeContainer.style.display = "none";
								iframeContainer.style.bottom = "-370px";
							});




							(function(){
							  var bc = document.getElementById('buttonContainer');
							  if(!bc) return;
							
							  /* 1) Izveido “čaulu” un ieliek visas esošās pogas iekšā,
							        + pievieno etiķeti un kupola SVG */
							  var shell = document.createElement('div');
							  shell.className = 'dock-shell';

shell.setAttribute('data-no-gap-fix', '1');
if (bc) bc.setAttribute('data-no-gap-fix', '1'); // izmanto jau esošo 'var bc'

							
							  // savācam tikai tiešos bērnus, kas ir pogas:
							  var btns = [];
							  for (var i = bc.children.length - 1; i >= 0; i--) {
							    var el = bc.children[i];
							    if (el.tagName === 'BUTTON') btns.push(el);
							  }
							  btns.reverse().forEach(function(b){ shell.appendChild(b); });
							
							  // izveido label + cap
							  var dockLabel = document.createElement('div');
							  dockLabel.className = 'dock-label';
							  var dockCap = document.createElement('svg');
							  dockCap.className = 'dock-cap'; dockCap.setAttribute('aria-hidden','true');
							
							  // ieliekam shell un pēc tam label+cap (būt bērni “shell”, lai ģeometrija būtu relatīva)
							  bc.appendChild(shell);
							  shell.appendChild(dockCap);
							  shell.appendChild(dockLabel);

							
							  /* — DIMMERA UI — */
							  var dimWrap = document.createElement('div');
							  dimWrap.className = 'dock-dimmer';
							  dimWrap.innerHTML =
							    '<input id="mapDimmerRange" type="range" min="0" max="80" step="1">' +
							    '<span class="value" id="mapDimmerValue"></span>';
							  shell.insertBefore(dimWrap, shell.firstChild);

								// Uzreiz pēc slīdņa ielikšanas DOM
								setTimeout(function () {
								  const bc = document.getElementById('buttonContainer');
								  const range = document.getElementById('mapDimmerRange');
								  if (!bc || !range) return;
								
								  const apply = () => {
								    const side = bc.classList.contains('left') || bc.classList.contains('right');
								    if (side) {
								      range.setAttribute('orient','vertical');
								      range.classList.add('range-vertical');
								    } else {
								      range.removeAttribute('orient');
								      range.classList.remove('range-vertical');
								    }
								  };
								
								  // sākumā + turpmāk, kad mainās #buttonContainer klases
								  apply();
								  new MutationObserver(apply).observe(bc, { attributes:true, attributeFilter:['class'] });
								}, 0);


   
								// Tooltipam un fokusam (tāpat kā pogām)
								dimWrap.setAttribute('data-title', 'Tumšināt karti');
								dimWrap.setAttribute('aria-label', 'Tumšināt karti');
								dimWrap.setAttribute('tabindex', '0');
								dimWrap.id = 'mapDimmer'; // ne obligāti, bet noderīgi
								
								  // sasaistām ar mainīgo + localStorage
								  var dimRange = dimWrap.querySelector('#mapDimmerRange');
								window.__bindDimmer && window.__bindDimmer(dimRange);

								  var dimValue = dimWrap.querySelector('#mapDimmerValue');
								
								  var stored = +(localStorage.getItem('mapDarken') || 0);
								  mapDarken = stored / 100;        // izmanto globālo mainīgo no 2. soļa
								  dimRange.value = stored;
								  dimValue.textContent = stored + '%';
								
								  dimRange.addEventListener('input', function(e){
  const v = +e.target.value;
  setDarkness(v);            // sinhronizē canvas + onlineMap un saglabā localStorage
  dimValue.textContent = v + '%';
  setRangeFill(dimRange);    // atjauno CSS progresu
});

							
								function setRangeFill(el){
								  const min = +el.min || 0, max = +el.max || 100, val = +el.value || 0;
								  const p = (val - min) * 100 / (max - min); // 0..100
								  el.style.setProperty('--p', p);
								}
								setRangeFill(dimRange);
								dimRange.addEventListener('input', e => setRangeFill(e.target));
								
								
								
								// ⬇️ Pievieno šo — sākotnēji iestata pareizu pārklājumu (span)
								window.__updateDimmerWidth && window.__updateDimmerWidth();


 
							  /* 2) Pievieno etiķešu tekstus (ja nav), saglabājot Tavu ID loģiku */
							  var titlesById = {
							    resetMap:        'Restartēt karti',
							    uploadMap:       'Augšupielādēt karti',
							    resetCompass:    'Restartēt kompasu',
							    toggleRotationMode: 'Griezt bāzi / skalu',
							    lockRotationMode:   'Bloķēt rotāciju',
							    rotateCompass90: 'Tīklveida režīms',
							    toggleFullscreen:'Pilnekrāna režīms'
							  };
							 var allTriggers = shell.querySelectorAll('button, .dock-dimmer');
							 allTriggers.forEach ? allTriggers.forEach(setTitle) : [].slice.call(allTriggers).forEach(setTitle);

							  function setTitle(b){
							    var id=b.id||'';
							    if(!b.getAttribute('data-title') && titlesById[id]) b.setAttribute('data-title', titlesById[id]);
							    if(!b.getAttribute('aria-label') && titlesById[id]) b.setAttribute('aria-label', titlesById[id]);
							  }
							
							  /* 3) Kupola ģeometrija (horizontālam izvietojumam) */
							  function updateCapGeometry(){
							    var cs = getComputedStyle(shell);
							    var labelW = parseFloat(cs.getPropertyValue('--labelW')) || 0;
							    var extra  = parseFloat(cs.getPropertyValue('--capExtraW')) || 0;
							    var w = labelW + 22 + extra;
							    var h = parseFloat(cs.getPropertyValue('--capH')) || 0;
							    var inset = parseFloat(cs.getPropertyValue('--capSkew')) || 0;
							    var r = parseFloat(cs.getPropertyValue('--capR')) || 0;
							    if(!w || !h) return;
							
							    var TLx = inset + r, TRx = w - inset - r;
							    var LEx = inset, LEy = r;
							    var REx = w - inset, REy = r;
							
							    var sideMidY = r + (h - r) * 0.45;
							    var rightCP1x = REx + (w - REx) * 0.18, rightCP1y = sideMidY;
							    var rightCP2x = w, rightCP2y = r + (h - r) * 0.82;
							    var leftCP2x  = 0,  leftCP2y  = r + (h - r) * 0.82;
							    var leftCP1x  = LEx - (LEx - 0) * 0.18, leftCP1y  = sideMidY;
							
							    dockCap.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
							    dockCap.setAttribute('width', w);
							    dockCap.setAttribute('height', h);
							    dockCap.innerHTML =
							      '<defs>' +
							        '<linearGradient id="capFill" x1="0" y1="0" x2="0" y2="1">' +
							          '<stop offset="0%"  stop-color="rgba(40,44,52,.96)"/>' +
							          '<stop offset="100%" stop-color="rgba(30,33,40,.96)"/>' +
							        '</linearGradient>' +
							        '<radialGradient id="capShine" cx="50%" cy="-30%" r="120%">' +
							          '<stop offset="0%" stop-color="rgba(255,255,255,.18)"/>' +
							          '<stop offset="60%" stop-color="rgba(255,255,255,0)"/>' +
							        '</radialGradient>' +
							      '</defs>' +
							      '<path d="' +
							        'M ' + TLx + ',0 H ' + TRx + ' A ' + r + ',' + r + ' 0 0 1 ' + REx + ',' + REy + ' ' +
							        'C ' + rightCP1x + ',' + rightCP1y + ' ' + rightCP2x + ',' + rightCP2y + ' ' + w + ',' + h + ' ' +
							        'L 0,' + h + ' C ' + leftCP2x + ',' + leftCP2y + ' ' + leftCP1x + ',' + leftCP1y + ' ' + LEx + ',' + LEy + ' ' +
							        'A ' + r + ',' + r + ' 0 0 1 ' + TLx + ',0 Z" fill="url(#capFill)" stroke="rgba(210,34,34,.38)" stroke-width="1" />' +
							      '<path d="' +
							        'M ' + TLx + ',0 H ' + TRx + ' A ' + r + ',' + r + ' 0 0 1 ' + REx + ',' + REy + ' ' +
							        'C ' + rightCP1x + ',' + rightCP1y + ' ' + rightCP2x + ',' + rightCP2y + ' ' + w + ',' + h + ' ' +
							        'L 0,' + h + ' C ' + leftCP2x + ',' + leftCP2y + ' ' + leftCP1x + ',' + leftCP1y + ' ' + LEx + ',' + LEy + ' ' +
							        'A ' + r + ',' + r + ' 0 0 1 ' + TLx + ',0 Z" fill="url(#capShine)" />';
							  }
							
							  /* 4) Kustība — gluds X horizontāli; Y vertikāli */
							  var raf=null, targetX=null, currentX=null;
							  function setTipX(px){
							    targetX = px;
							    if(currentX == null) currentX = px;
							    if(raf) return;
							    function step(){
							      currentX += (targetX - currentX) * 0.25;
							      shell.style.setProperty('--tipX', currentX + 'px');
							      if(Math.abs(targetX - currentX) > 0.5){ raf = requestAnimationFrame(step); }
							      else { shell.style.setProperty('--tipX', targetX + 'px'); raf=null; }
							    }
							    raf = requestAnimationFrame(step);
							  }
							  function setTipY(py){ shell.style.setProperty('--tipY', py + 'px'); }
							
							  function isVertical(){
							    return bc.classList.contains('left') || bc.classList.contains('right');
							  }
							
							  function showFor(btn){
							    var rShell = shell.getBoundingClientRect();
							    var rBtn   = btn.getBoundingClientRect();
							    var title  = btn.getAttribute('data-title') || btn.getAttribute('aria-label') || '';
							
							    dockLabel.textContent = title || '';
							    // lai izmērītu īsto platumu/augstumu pirms ģeometrijas:
							    dockLabel.style.opacity = '0.001'; // gandrīz neredzams uz mirkli
							    dockLabel.style.pointerEvents = 'none';
							
							    // pieslēdzam klasei animācijas stāvokli
							    shell.classList.add('show-label');
							
							    // pēc nākamā frame izmēram platumu/augstumu un atjauninām kupolu (horizontāliem)
							    requestAnimationFrame(function(){
							      var lw = Math.min(dockLabel.scrollWidth + 2, rShell.width - 40);
							      shell.style.setProperty('--labelW', lw + 'px');
							      shell.style.setProperty('--capH', (dockLabel.offsetHeight + 2) + 'px');
							
							      if(!isVertical()){
							        // horizontāli: kupols redzams
							        shell.classList.add('show-cap');
							        // centrs X:
							        var cx = rBtn.left + rBtn.width/2 - rShell.left;
							        setTipX(cx);
							        updateCapGeometry();
							      }else{
							        // vertikāli: slēpjam kupolu, slīdam pa Y
							        shell.classList.remove('show-cap');
							        var cy = rBtn.top + rBtn.height/2 - rShell.top;
							        setTipY(cy);
							      }
							      dockLabel.style.opacity = '1';
							    });
							  }
							  function hideTip(){ shell.classList.remove('show-label','show-cap'); }
							
							  /* 5) Notikumi – tikai uz īstajām pogām, lai neskartu Tavu esošo loģiku */
							  var hideT=null;
							  function arm(btn){
							    btn.addEventListener('mouseenter', function(){
							      if(hideT) clearTimeout(hideT);
							      showFor(btn);
							    });
							    btn.addEventListener('focus', function(){
							      showFor(btn);
							    });
							    btn.addEventListener('mouseleave', function(){
							      if(hideT) clearTimeout(hideT);
							      hideT = setTimeout(hideTip, 180);
							    });
							    // touch — ātri parādam un pēc 1.6s paslēpjam
							    btn.addEventListener('touchstart', function(){
							      if(hideT) clearTimeout(hideT);
							      showFor(btn);
							      hideT = setTimeout(hideTip, 1600);
							    }, {passive:true});
							  }
							  [].slice.call(allTriggers).forEach(arm);

							
							  // Uz loga izmēru maiņas – paslēpjam
							  window.addEventListener('resize', hideTip);
							
							  // Sākotnējais stāvoklis: ja vertical, kupolu neredzam
							  if(isVertical()) shell.classList.remove('show-cap');
							  window.__fitDock && window.__fitDock();
							})();



(function keepDockMarginsFromCSS(){
  const shell = document.querySelector('#buttonContainer .dock-shell');
  if (!shell) return;
  const strip = () => shell.querySelectorAll('button').forEach(b=>{
    b.style.removeProperty('margin');
    b.style.removeProperty('margin-left');
    b.style.removeProperty('margin-right');
    b.style.removeProperty('margin-top');
    b.style.removeProperty('margin-bottom');
  });
  strip();
  new MutationObserver(strip).observe(shell, {subtree:true, attributes:true, attributeFilter:['style']});
})();









							
							// === Auto-fit dokam (#buttonContainer .dock-shell) — ar apakšējās joslas korekciju ===
							(function(){
							 function fitDock(){
							    const bc = document.getElementById('buttonContainer');
							    if(!bc) return;
							    const shell = bc.querySelector('.dock-shell');
							    if(!shell) return;
							
							    const about = document.getElementById('about');
							    const ah = about ? (about.getBoundingClientRect().height || 0) : 0;
							
							    const isBottom   = bc.classList.contains('bottom');
							    const isVertical = bc.classList.contains('left') || bc.classList.contains('right');
							
							    /* ❗ NEKĀDUS inline bottom */
							    bc.style.removeProperty('bottom');
							
							    /* Apakšā – tikai tik, lai nepārklātos ar #about (vai 8px) */
							    if (isBottom) {
							      const gap = Math.max(8, ah + 8);
							      document.documentElement.style.setProperty('--dock-bottom', gap + 'px');
							    }
							
							    /* Mērogs – tikai samazinām, nestiepjam malas */
							    const prev = shell.style.transform;
							    shell.style.transform = 'none';
							    const natural = shell.getBoundingClientRect();
							    shell.style.transform = prev;
							
							    let maxW = window.innerWidth * 0.98;
							    let maxH = window.innerHeight * 0.94;
							    if (isVertical) maxH = Math.max(120, maxH - ah);
							
							    let scale = isVertical
							      ? Math.min(1, maxH / natural.height)
							      : Math.min(1, maxW / natural.width);
							
							    scale = Math.max(0.35, Math.min(1, scale));
							    shell.style.transform = 'scale(' + scale + ')';
							  }
							
							  window.__fitDock = fitDock;
							  const queue = () => setTimeout(fitDock, 50);
							  window.addEventListener('load', fitDock);
							  window.addEventListener('resize', queue);
							  window.addEventListener('orientationchange', queue);
							})();

							
							// 🔹 Tagad __fitDock noteikti ir definēts — pielāgo mērlogu uzreiz
							window.__fitDock && window.__fitDock();




(function(){
  function updateDimmerPlacement(){
    var bc  = document.getElementById('buttonContainer');
    if(!bc) return;
    var dim = bc.querySelector('.dock-dimmer');
    if(!dim) return;

    dim.style.gridRow    = '';
    dim.style.gridColumn = '';
    dim.style.width      = '';
    dim.style.maxWidth   = '';
    dim.style.height     = '';
    dim.style.removeProperty('--colH');
  }

  function updateDimmerSpan(){
    var bc    = document.getElementById('buttonContainer');
    if(!bc) return;
    var shell = bc.querySelector('.dock-shell');
    if(!shell) return;
    var dim   = shell.querySelector('.dock-dimmer');
    if(!dim) return;

    var side = bc.classList.contains('left') || bc.classList.contains('right');
    if (!side) { dim.style.gridRow = ''; return; }

    var children = [].slice.call(shell.children);
    var rows = Math.max(
      1,
      children.filter(function(el){ return el.tagName === 'BUTTON' && el.offsetParent !== null; }).length
    );

    dim.style.gridRow = '1 / span ' + rows;
  }

  function updateDimmerAll(){
    updateDimmerPlacement();
    updateDimmerSpan();
  }

  window.__updateDimmerWidth = updateDimmerAll;
  window.addEventListener('load',  updateDimmerAll);
  window.addEventListener('resize',updateDimmerAll);
})();

							
							(function(){
							  const prevUpdate = window.__updateDimmerWidth || function(){};
							
							  function measureBottomRowWidth(){
							    const bc = document.getElementById('buttonContainer');
							    if(!bc || !bc.classList.contains('bottom')) return;
							    const shell = bc.querySelector('.dock-shell');
							    if(!shell) return;
							
							    const btns = [...shell.children].filter(el => el.tagName === 'BUTTON' && el.offsetParent !== null);
							    if(!btns.length) return;
							
							    const top0 = Math.min(...btns.map(b => b.offsetTop));
							    const firstLine = btns.filter(b => Math.abs(b.offsetTop - top0) < 2);
							    const rects = firstLine.map(b => b.getBoundingClientRect());
							    const minL = Math.min(...rects.map(r => r.left));
							    const maxR = Math.max(...rects.map(r => r.right));
							    const w = Math.round(maxR - minL);
							
							    const shellEl = bc.querySelector('.dock-shell');
							    shellEl && shellEl.style.setProperty('--rowW', w + 'px');
							  }
							
							  /* NEW: izmēri pogu kolonnas kopējo augstumu sānos (left/right) */
							  function measureSideColHeight(){
							    const bc = document.getElementById('buttonContainer');
							    if(!bc || !(bc.classList.contains('left') || bc.classList.contains('right'))) return;
							
							    const shell = bc.querySelector('.dock-shell');
							    const dim   = shell && shell.querySelector('.dock-dimmer');
							    if(!shell || !dim) return;
							
							    const btns = [...shell.children].filter(el => el.tagName === 'BUTTON' && el.offsetParent !== null);
							    if(!btns.length) return;
							
							    const rects = btns.map(b => b.getBoundingClientRect());
							    const top   = Math.min(...rects.map(r => r.top));
							    const bottom= Math.max(...rects.map(r => r.bottom));
							    const h     = Math.max(0, Math.round(bottom - top));   // pogu kolonnas “garums”, iesk. rindstarpas
							
							    // iedodam .dock-dimmer CSS mainīgo + drošības pēc arī height
							    dim.style.setProperty('--colH', h + 'px');
							    dim.style.height = h + 'px';
							  }
							
							  window.__updateDimmerWidth = function(){
							    prevUpdate();
							    measureBottomRowWidth();
							    measureSideColHeight();
							  };
							
							  const run = () => window.__updateDimmerWidth && window.__updateDimmerWidth();
							  window.addEventListener('load', run);
							  window.addEventListener('resize', run);
							  window.addEventListener('orientationchange', run);
							  run();
							})();

				
							(function () {
							  // ── nodrošinām, ka ir konteiners ─────────────────────────────────────────────
							  const bc = document.getElementById('buttonContainer');
							  if (!bc) return;
							
							  // ── SVG ikona (backticki aizsargāti ar \`) ───────────────────────────────────
							  const GRID_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="3" width="7" height="7"></rect>
  <rect x="14" y="3" width="7" height="7"></rect>
  <rect x="3" y="14" width="7" height="7"></rect>
  <rect x="14" y="14" width="7" height="7"></rect>
</svg>
`;
							
							  /* — ROKTURIS — */
							  const handle = document.createElement('div');
							  handle.className = 'dock-handle';
							  handle.setAttribute('title', 'Parādīt pogas');
							  handle.setAttribute('aria-label', 'Parādīt pogas');
							  handle.innerHTML = GRID_ICON; // uzreiz ieliekam SVG
							  bc.appendChild(handle);
							
							  /* — PUBLISKĀS FUNKCIJAS — */
							  function dockButtons() { bc.classList.add('docked'); window.__updateMapSafeAreas && window.__updateMapSafeAreas(); }
							  function showButtons() { bc.classList.remove('docked'); window.__fitDock && window.__fitDock(); window.__updateMapSafeAreas && window.__updateMapSafeAreas(); }
							
							  // Piesienam rokturim
							  handle.addEventListener('click', showButtons);
							
							  // Ja maina novietojumu ar selectiem — atjaunojam un pārrēķinām izkārtojumu
							  const leftSel  = document.getElementById('positionSelectLeft');
							  const rightSel = document.getElementById('positionSelect');
							  function refreshBySelect() { handle.innerHTML = GRID_ICON; window.__fitDock && window.__fitDock(); }
							  leftSel  && leftSel.addEventListener('change', refreshBySelect);
							  rightSel && rightSel.addEventListener('change', refreshBySelect);
							
							  // Ielāpam updateButtonContainerPosition, lai rokturis sekotu
							  if (window.updateButtonContainerPosition) {
							    const _old = window.updateButtonContainerPosition;
							    window.updateButtonContainerPosition = function (pos) {
							      _old(pos);
							      refreshBySelect();
							      // ja bija dokēts, saglabājas; rokturis vienmēr pareizā vietā
							    };
							  }
							
							  /* — AUTOMĀTISKĀ DOKĒŠANA, kad sāc “darbu ar saturu” — */
							  const map     = document.getElementById('mapCanvas');
							  const compass = document.getElementById('compassContainer');
							
							  ['pointerdown', 'mousedown', 'touchstart'].forEach(ev => {
							    map     && map.addEventListener(ev, dockButtons,    { passive: true });
							    compass && compass.addEventListener(ev, dockButtons, { passive: true });
							  });
							
							  // Pēc loga/virtuālā viewport izmaiņām pielāgo mērogu
							  function onViewportChange() { window.__fitDock && window.__fitDock(); }
							  window.addEventListener('resize', onViewportChange);
							  if (window.visualViewport) {
							    window.visualViewport.addEventListener('resize', onViewportChange);
							    window.visualViewport.addEventListener('scroll', onViewportChange);
							  }
							})();





//PRINTMEDIA TESTERIS

// === PrintMedia overlay tester — drop-in, zero CSS edits ===
(function(){
  const OVERLAY_ID = 'printAreaOverlay';
  const STYLE_ID   = 'printAreaOverlayCSS';
  const mm2px = mm => Math.round(mm * 96 / 25.4);

  function ensureStyles(){
    if (document.getElementById(STYLE_ID)) return;
    const st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = `
#printAreaOverlay{position:fixed;inset:0;margin:auto;width:0;height:0;z-index:2147483647;pointer-events:none;border:3px dashed rgba(255,0,0,.75);background:rgba(255,0,0,.12);box-shadow:0 0 0 9999px rgba(0,0,0,.15);display:none}
#printAreaOverlay .label{position:absolute;right:8px;bottom:8px;font:600 12px/1.2 system-ui,sans-serif;padding:6px 8px;background:rgba(0,0,0,.55);color:#fff;border-radius:6px}`;
    document.head.appendChild(st);
  }
  function ensureOverlay(){
    let el = document.getElementById(OVERLAY_ID);
    if (!el){
      el = document.createElement('div');
      el.id = OVERLAY_ID;
      el.innerHTML = '<div class="label"></div>';
      document.body.appendChild(el);
    }
    return el;
  }

  // Nolasām mm no TAVA dinamiski ieliktā CSS noteikuma `body.print-mode #onlineMap`
  function findPrintBoxMm(){
    let mm = { w:277, h:190, src:'default' }; // fallback: A4 ainava (277×190 mm)
    for (const ss of document.styleSheets){
      let rules;
      try { rules = ss.cssRules || ss.rules; } catch(e){ continue; } // CORS
      if (!rules) continue;
      for (const r of rules){
        if (r.type === CSSRule.MEDIA_RULE && r.cssRules){
          for (const rr of r.cssRules){ mm = parseRule(rr, mm); }
        } else {
          mm = parseRule(r, mm);
        }
      }
    }
    return mm;

    function parseRule(rule, out){
      const sel = rule.selectorText || '';
      if (sel && sel.includes('body.print-mode') && sel.includes('#onlineMap')){
        const txt = rule.cssText || '';
        const mW = /width\s*:\s*([\d.]+)mm/i.exec(txt);
        const mH = /height\s*:\s*([\d.]+)mm/i.exec(txt);
        if (mW && mH){
          return { w: parseFloat(mW[1]), h: parseFloat(mH[1]), src:'css' };
        }
      }
      return out;
    }
  }

  function showOverlay(ms=5000){
    ensureStyles();
    const el = ensureOverlay();
    const { w, h } = findPrintBoxMm();

    // mm -> px uz ekrāna; centrē skatlogā (kā print CSS ar inset:0;margin:auto;)
    const vpW = window.innerWidth;
    const vpH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const wpx = mm2px(w), hpx = mm2px(h);
    const scale = Math.min(vpW / wpx, vpH / hpx, 1);

    el.style.width  = Math.floor(wpx * scale) + 'px';
    el.style.height = Math.floor(hpx * scale) + 'px';
    el.style.display = 'block';
    el.querySelector('.label').textContent =
      `print-media: ${w}×${h} mm  ≈  ${Math.round(wpx)}×${Math.round(hpx)} px`;

    clearTimeout(showOverlay._t);
    showOverlay._t = setTimeout(()=> el.style.display='none', ms);
  }

  // Piesienamies TAVAI esošajai pogai (bez citu handleru mainīšanas)
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest && e.target.closest('#preparePrintBtn');
    if (!btn) return;
    showOverlay(); // vizualizē print kasti
  }, true);
})();



















/* ===== VC TOUR v11 — clip-path izgriež mērķi no blur, stingra secība, “?” poga, demo animācijas ===== */
(() => {
  if (window.__VC_TOUR_V11__) return; window.__VC_TOUR_V11__ = 1;

  // ——— Utils
  const qs  = (s, r=document)=> r.querySelector(s);
  const vis = (el)=> !!el && el.offsetWidth>0 && el.offsetHeight>0 &&
    getComputedStyle(el).visibility!=='hidden' && getComputedStyle(el).display!=='none';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const VW = ()=> innerWidth;
  const VH = ()=> (visualViewport?.height || innerHeight);
  const isTouch = ('ontouchstart' in window) || matchMedia?.('(pointer: coarse)').matches;

  // ——— UI (viens slānis ar clip-path, bez “šuvēm”)
  let host, sh, overlay, ring, tip, progress, hint, running=false, idx=-1;
  function ensureUI(){
    if (host) return;
    host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483655;';
    sh = host.attachShadow({mode:'open'});

    const css = `
      :host{ all:initial }
      .overlay{
        position:fixed; inset:0;
        background:rgba(10,14,18,.55);
        backdrop-filter: blur(10px) saturate(1.05);
        -webkit-backdrop-filter: blur(10px) saturate(1.05);
        clip-path:none; pointer-events:none;
        transition: clip-path .18s ease, background-color .18s ease;
      }
      .ring{
        position:fixed; pointer-events:none; border-radius:12px;
        outline:2px solid rgba(255,255,255,.9);
        box-shadow:0 0 0 2px rgba(255,255,255,.18) inset, 0 14px 38px rgba(0,0,0,.45), 0 0 0 12px rgba(255,255,255,.06);
        transition:all .18s ease;
      }
      .tip{
        position:fixed; max-width:min(460px,92vw);
        color:#eaf1ff; background:linear-gradient(180deg,rgba(17,21,29,.96),rgba(26,12,26,.92));
        border:1px solid #ffffff1e; border-radius:14px; padding:12px 14px;
        box-shadow:0 20px 54px rgba(0,0,0,.55); pointer-events:auto; opacity:.99;
        transform:translateY(6px); animation:tipIn .18s ease forwards;
      }
      @keyframes tipIn{ to{ transform:translateY(0) } }
      .tip h3{ margin:0 0 6px; font:700 16px/1.3 system-ui,Segoe UI,Roboto,Arial }
      .tip p{ margin:0; font:13px/1.45 system-ui,Segoe UI,Roboto,Arial; opacity:.95 }
      .nav{ display:flex; gap:8px; justify-content:flex-end; margin-top:10px }
      .sp{ margin-right:auto; color:#9fb3c8; font:12px/1.4 ui-monospace,monospace }
      .btn{ appearance:none; border:1px solid #ffffff33; background:#ffffff12; color:#fff; border-radius:10px; padding:7px 11px; font:600 12px/1 system-ui; cursor:pointer }
      .btn:hover{ background:#ffffff21 }
      .x{ position:absolute; right:8px; top:8px; width:26px; height:26px; border-radius:8px; border:1px solid #ffffff25; background:#ffffff14; color:#fff; font:700 14px/24px system-ui; text-align:center; cursor:pointer }
      .progress{ position:fixed; left:12px; bottom:12px; pointer-events:none; color:#cfe8c1; background:rgba(20,30,20,.86); border:1px solid #2a4621; border-radius:999px; padding:5px 9px; font:12px/1 ui-monospace,monospace }
      .hint{ position:fixed; width:28px; height:28px; border-radius:50%; pointer-events:none; opacity:.9; transition:opacity .2s }
      .hint.drag{ outline:2px dashed #fff3; }
      .hide{ display:none !important }
    `;
    sh.appendChild(Object.assign(document.createElement('style'),{textContent:css}));
    overlay = Object.assign(document.createElement('div'), {className:'overlay'});
    ring    = Object.assign(document.createElement('div'), {className:'ring'});
    tip     = Object.assign(document.createElement('div'), {className:'tip'});
    progress= Object.assign(document.createElement('div'), {className:'progress'});
    hint    = Object.assign(document.createElement('div'), {className:'hint hide'});
    sh.append(overlay, ring, tip, progress, hint);
    document.body.appendChild(host);
    hideUI();
  }
  function showUI(){ host.style.pointerEvents='none'; [overlay,ring,tip,progress].forEach(n=>n.classList.remove('hide')); }
  function hideUI(){ host.style.pointerEvents='none'; [overlay,ring,tip,progress,hint].forEach(n=>n.classList.add('hide')); }

  // ——— ģeometrija (viena path ar “caurumu” → nav svītru)
  function placeCutout(rect, pad=8, radius=12){
    const vw=VW(), vh=VH();
    const x = clamp(Math.floor(rect.left)-pad, 0, vw);
    const y = clamp(Math.floor(rect.top)-pad,  0, vh);
    const w = Math.ceil(rect.width) + pad*2;
    const h = Math.ceil(rect.height)+ pad*2;

    // ārējais (CW)
    const outer = `M0 0H${vw}V${vh}H0Z`;
    // iekšējais (CCW) — ar nonzero noteikumu veido “caurumu”
    const innerCCW = `M${x} ${y}V${y+h}H${x+w}V${y}H${x}Z`;

    const d = `${outer} ${innerCCW}`;
    overlay.style.clipPath = `path("${d}")`;
    overlay.style.webkitClipPath = `path("${d}")`; // Safari
    Object.assign(ring.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px',borderRadius:radius+'px'});
  }

  // ——— stabila “lipīga” tip novietošana (nemētājas)
  const posMemo = Object.create(null);
  const clampPos=(x,y,tw,th)=>({x:clamp(x,8,VW()-tw-8), y:clamp(y,8,VH()-th-8)});
  function placeTip(rect, key, pref='right'){
    tip.style.left='-9999px'; tip.style.top='-9999px';
    const gap=12, tw=Math.min(tip.offsetWidth||360,VW()-16), th=tip.offsetHeight||120;
    const base = posMemo[key] || pref;
    const fits = {
      right:  rect.left+rect.width+gap+tw < VW()-8,
      left:   rect.left-gap-tw > 8,
      top:    rect.top-gap-th > 8,
      bottom: rect.bottom+gap+th < VH()-8
    };
    let pos = fits[base] ? base : (['right','left','bottom','top'].find(p=>fits[p])||base);
    let x=rect.left+rect.width+gap, y=rect.top;
    if (pos==='left')   { x=rect.left - tw - gap; }
    if (pos==='top')    { x=rect.left; y=rect.top - th - gap; }
    if (pos==='bottom') { x=rect.left; y=rect.bottom + gap; }
    const p=clampPos(x,y,tw,th); tip.style.left=p.x+'px'; tip.style.top=p.y+'px'; posMemo[key]=pos;
  }
  function resetTipMemo(){ for(const k in posMemo) delete posMemo[k]; }

  // ——— īsa demo (“pamēģini” sajūta), nekad neblokē īstos eventus
  let demoStop=null; const stopDemo=()=>{ if(demoStop){ try{demoStop()}catch{} demoStop=null; } hint.classList.add('hide'); };
  function demoRotate(el){ if(!el) return ()=>{}; const prev=el.style.transform; let k=0;
    const id=setInterval(()=>{ k++; el.style.transform = `${prev} rotate(${Math.sin(k/4)*4}deg)`; }, 60);
    return ()=>{ clearInterval(id); el.style.transform=prev; };
  }
  function demoSlider(input){ if(!input) return ()=>{}; const orig=input.value; let t=0;
    const id=setInterval(()=>{ t+=0.06; const v=Math.round(50+45*Math.sin(t)); input.value=v;
      input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); },60);
    return ()=>{ clearInterval(id); input.value=orig; input.dispatchEvent(new Event('input',{bubbles:true})); };
  }

  // ——— Soļi: ļoti konkrēti elementi + “ensure” atvēršanai
  const T = {
    compass: isTouch
      ? 'Skārienā: velc pārvieto; pincete — mērogs; 2 pirkstu grieziens — griež izvēlēto daļu.'
      : 'Pele: velc pārvieto; ALT+rullītis — mērogs; SHIFT — griež bāzi, CTRL — griež skalu.',
    base: 'Bāze griežas ap skalas centru (precīzi saskaņota). SHIFT+rullītis (pele) vai 2-pirkstu grieziens (skāriens).',
    scale: 'Skala griežas neatkarīgi no bāzes. CTRL+rullītis (pele) vai 2-pirkstu grieziens (skāriens).'
  };

  const STEPS = [
    { sel:'#buttonContainer',  title:'Ātrās darbības', body:'Galvenās kontroles pogas', place:'top', optional:true },

// pogu novietojuma selektori	  
{
  sel:'.toggle-selector',
  title:'Atvērt / aizvērt pogu novietojuma izvēlne (labā puse)',
  place:'left',
  optional:true,
  ensure:()=>{
    const p = document.querySelector('.position-selector');
    p && p.classList.remove('hidden');   // atver paneli (ja slēpts)
  }
},
{ sel:'#positionSelect', title:'Izvēlies: Apakša / Pa kreisi / Pa labi', place:'left', optional:true },

{
  sel:'.toggle-selector-left',
  title:'Atvērt / aizvērt pogu novietojuma izvēlne (kreisā puse)',
  place:'right',
  optional:true,
  ensure:()=>{
    const p = document.querySelector('.position-selector-left');
    p && p.classList.remove('hidden-left'); // atver kreiso paneli (ja slēpts)
  }
},
{ sel:'#positionSelectLeft', title:'Izvēlies: Apakša / Pa kreisi / Pa labi', place:'right', optional:true },   

    // BĀZE (vizuāli iezīmējam #compassBase)
{ sel:'#compassBase',  title:'Griezt BĀZI',  body:T.base,  place:'right',
  demo:()=>demoRotate(document.getElementById('compassInner')) },

    // SKALA (iezīmējam #compassScale, lai lietotājs saprot atšķirību)
{ sel:'#compassScale', title:'Griezt SKALU', body:T.scale, place:'right',
  demo:()=>demoRotate(document.getElementById('compassScaleInner')) },

 // Kompass — vispārīgi
    { sel:'#compassContainer', title:'Kompass (pārvieto/mērogo/griez)', body:T.compass, place:'right' },
	  
    // Režīma pogas
    { sel:'#toggleRotationMode', title:'Bāze ⇄ Skala', body:'Pārslēdz, kuru daļu grozīt ar žestiem.', place:'top', optional:true },
    { sel:'#lockRotationMode',   title:'Bloķēt rotāciju', body:'Fiksē rotāciju ērtai tālummaiņai.', place:'top', optional:true },
    { sel:'#rotateCompass90',    title:'Koordināšu noteikšanas opcijas', body:'Izvēlies ar kādu metodi noteiksi koordinātes.', place:'top', optional:true },
    { sel:'#resetCompass',       title:'Atjauno kompasu', body:'Atgriež sākumstāvoklī (pozīcija un izmērs).', place:'top', optional:true },

    // Lokālā karte
    { sel:'#uploadMap',        title:'Augšupielādēt karti', body:'Ielādē JPG/PNG/PDF (vienu vai vairāku lapu fails)/URL kartes.', place:'top', optional:true },
    { sel:'#mapCanvas',        title:'Lokālā karte', body:(isTouch?'Tālummaiņa ritinot pelītes rulīti vai ar diviem pikstiem velkot uz augšu/leju touchpad; Pārvieto spiezot peles kreiso pogu un velkot.':'Tālummaiņa - divu pirkstu tuvināšana/tālināšana; Pārvietot - peskaries un velc.'), place:'bottom', optional:true },
	{ sel:'#resizeHandle',     title:'Izmēra rokturis', body:'Uzspied un velc, lai mainītu lokālās kartes izmēru (ieteicams kalibrēšanai ar kompasu).', place:'bottom', optional:true },
    { sel:'#resetMap',         title:'Atjauno lokālo karti.', body:'Atgriežas sākumstāvoklī (pozīcija un izmērs).', place:'top', optional:true },

    // Tiešsaistes karte + slāņi + PDF
    { sel:'#toggleOnlineMap',  title:'Tiešsaistes karte', ensure:()=>{ const m=qs('#onlineMap'); if(!m||!vis(m)) qs('#toggleOnlineMap')?.click(); }, body:'Ritenis/touchpad/žesti — tālummaiņa; nospied un velc — pārvieto.', place:'bottom', optional:true },
    { sel:'.leaflet-control-zoom-in', title:'Tālummaiņas pogas', body:'Tiešsaistes kartes + / −', place:'left', optional:true },
    { sel:'.leaflet-control-layers-toggle', title:'Slāņi', ensure:()=>qs('.leaflet-control-layers')||qs('.leaflet-control-layers-toggle')?.click(), body:'Pamatkartes un pārklājumi.', place:'left', optional:true },
  
    { sel:'#mapDimmerRange',   title:'Tumšuma slīdnis', body:'Maini lokālās un tiešsaistes kartes spilgtumu, lai izceltu kompasu. Automātiski tiek noņemts drukā', place:'right', optional:true },
    { sel:'#preparePrintBtn',  title:'Sagatavot drukai', body:'Izvēlies formātu/mērogu, sagatavo drukai vai saglabāšanai PDF.', place:'left', optional:true },

    // Pilnekrāns
    { sel:'#toggleFullscreen', title:'Pilnekrāns', body:'Ieslēgt/izslēgt ērtākam darbam.', place:'top', optional:true },

    // Info/Par
    { sel:'#toggleInstruction', title:'Detalizētas instrukcijas', place:'bottom', optional:true },
    { sel:'#toggleMaterials',   title:'Mācību materiāli', place:'bottom', optional:true },
    { sel:'#about',             title:'Koplietošanas QR auditorijai / Par rīku / Ziņot.', place:'top', optional:true },
  ];

  // ——— Plūsma (ātra gaidīšana: ~0.2s; ja nav — atlikt uz beigām)
  const deferrals = Object.create(null);
  function start(){ ensureUI(); resetTipMemo(); running=true; idx=0; run(); }
  function stop(){ running=false; hideUI(); stopDemo(); }
  function next(){ if(!running) return; idx++; run(); }
  function prev(){ if(!running) return; idx=Math.max(0,idx-1); run(true); }


// app.js — pie ceļveža koda (pirms run)
function ensureDockOpen(){
  const bc = qs('#buttonContainer');
  if (bc && bc.classList.contains('docked')) bc.classList.remove('docked');
}


	
  function run(backwards=false){
    stopDemo();
    if (!running) return;
	ensureDockOpen();
    if (idx>=STEPS.length){ stop(); return; }

    const s = STEPS[idx];
    showUI();
    progress.textContent = `Ceļvedis — ${idx+1}/${STEPS.length}`;
    try{ s.ensure && s.ensure(); }catch{}

    let tries=0;
    (function wait(){
      if (!running) return;
      const el = qs(s.sel);
      const ok = el && vis(el);
      if (!ok){
        if (tries++<2){ setTimeout(wait, 100); return; } // ~0.2s max meklēšana
        const maxDef = s.optional ? 2 : 1;
        deferrals[s.sel]=(deferrals[s.sel]||0)+1;
        if (deferrals[s.sel] <= maxDef) STEPS.push(s);
        idx++; run(); return;
      }

      const r = el.getBoundingClientRect();
      placeCutout(r, 8, 12);

      tip.innerHTML = `
        <button class="x" data-act="close" title="Beigt">×</button>
        <h3>${s.title||''}</h3>
        <p>${(typeof s.body==='function'?s.body():s.body)||''}</p>
        <div class="nav">
          <span class="sp">${idx+1}/${STEPS.length}</span>
          ${idx>0?'<button class="btn" data-act="prev">Atpakaļ</button>':''}
          <button class="btn" data-act="next">${idx<STEPS.length-1?'Tālāk':'Pabeigt'}</button>
        </div>`;
      placeTip(r, s.sel, s.place||'right');

      // demo (ja definēts) — īss vizuāls mājiens
      if (s.demo) { demoStop = s.demo(el); }

      tip.querySelectorAll('[data-act]').forEach(b=>{
        b.onclick = (ev)=>{
          ev.stopPropagation();
          const a = b.getAttribute('data-act');
          if (a==='prev') prev();
          else if (a==='next') (idx<STEPS.length-1? next(): stop());
          else if (a==='close') stop();
        };
      });
    })();
  }

  // ——— Repozicionēšana (resize/scroll/mutations)
  const reposition = () => {
    if (!running) return;
    const s = STEPS[idx]; if (!s) return;
    const el = qs(s.sel); if (!vis(el)) return;
    const r = el.getBoundingClientRect(); placeCutout(r, 8, 12); placeTip(r, s.sel, s.place||'right');
  };
  addEventListener('resize', reposition, true);
  addEventListener('scroll',  reposition, true);
  visualViewport && (visualViewport.addEventListener('resize', reposition), visualViewport.addEventListener('scroll', reposition));
  new MutationObserver(()=> running && reposition())
    .observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','hidden','open','aria-expanded','aria-hidden']});

  // ——— Publiskais API + “?” poga
  window.helpTour = { start, stop, next, prev, go:(n)=>{ idx=clamp(n|0,0,STEPS.length-1); run(); } };
  window.startHelpTour = start;

  function ensureFab(){
    let fab = qs('#helpFab', document);
    if (!fab){
      fab = document.createElement('button');
      fab.id='helpFab'; fab.type='button'; fab.textContent='?';
      Object.assign(fab.style,{
        position:'fixed', right:'14px', bottom:'14px', width:'46px', height:'46px',
        borderRadius:'12px', border:'1px solid rgba(255,255,255,.16)',
        background:'linear-gradient(180deg,#1b1f25,#371017aa)', color:'#fff',
        font:'900 20px/46px system-ui', boxShadow:'0 12px 28px rgba(0,0,0,.55)', zIndex:2147483656, cursor:'pointer'
      });
      document.body.appendChild(fab);
    }
    if (!fab.__bound){ fab.__bound=1; fab.addEventListener('click', start); }
  }
  (document.readyState==='loading') ? document.addEventListener('DOMContentLoaded', ensureFab, {once:true}) : ensureFab();

  // Klaviatūra (sākšana/navigācija)
  document.addEventListener('keydown',(e)=>{
    if (e.key==='i'||e.key==='I'){ e.preventDefault(); start(); }
    if (!running) return;
    if (e.key==='Escape') stop();
    if (e.key==='ArrowRight') next();
    if (e.key==='ArrowLeft')  prev();
  });
})();















	

	



} // Boot guard end
